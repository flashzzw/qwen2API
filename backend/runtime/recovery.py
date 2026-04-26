from __future__ import annotations

import logging
from typing import Any, Awaitable, Callable

from backend.adapter.standard_request import StandardRequest
from backend.runtime.types import RuntimeAttemptState, RuntimeExecutionResult

log = logging.getLogger("qwen2api.runtime")


def _build_warmup_delta_handler(on_delta, *, warmup_chars: int, guard_chars: int):
    from backend.services.incremental_text_streamer import IncrementalTextStreamer

    if warmup_chars <= 0 or on_delta is None:
        return on_delta, None

    streamer = IncrementalTextStreamer(
        warmup_chars=warmup_chars,
        guard_chars=max(guard_chars, 64),
    )

    async def _wrapped(evt, text_chunk, tool_calls):
        if text_chunk is None or tool_calls is not None or evt.get("phase") not in ("answer", "text"):
            await on_delta(evt, text_chunk, tool_calls)
            return
        released = streamer.push(text_chunk)
        if released:
            await on_delta(evt, released, None)

    return _wrapped, streamer


async def _flush_warmup_tail(streamer, on_delta) -> None:
    if streamer is None or on_delta is None:
        return
    tail = streamer.finish()
    if tail:
        await on_delta({"phase": "answer"}, tail, None)


def _should_continue_recovery(result: RuntimeExecutionResult, request: StandardRequest, is_truncated) -> bool:
    state = result.state
    return bool(request.tools and not state.tool_calls and is_truncated(state.answer_text))


def _merge_continuation_result(
    base_result: RuntimeExecutionResult,
    continuation: RuntimeExecutionResult,
    deduped_text: str,
) -> RuntimeExecutionResult:
    state = base_result.state
    merged_state = RuntimeAttemptState(
        answer_text=state.answer_text + deduped_text,
        reasoning_text=state.reasoning_text,
        tool_calls=continuation.state.tool_calls or state.tool_calls,
        blocked_tool_names=continuation.state.blocked_tool_names or state.blocked_tool_names,
        finish_reason=continuation.state.finish_reason or state.finish_reason,
        raw_events=state.raw_events,
        emitted_visible_output=state.emitted_visible_output or continuation.state.emitted_visible_output,
        stage_metrics=state.stage_metrics,
    )
    return RuntimeExecutionResult(state=merged_state, chat_id=base_result.chat_id, acc=base_result.acc)


async def _run_continuation(
    *,
    client,
    request: StandardRequest,
    prompt: str,
    result: RuntimeExecutionResult,
    on_delta,
    collect_completion_run,
    build_continuation_prompt,
    deduplicate_continuation,
) -> tuple[RuntimeExecutionResult, bool]:
    state = result.state
    assistant_ctx, followup = build_continuation_prompt(state.answer_text, anchor_chars=2000)
    cont_prompt = f"{prompt.rstrip()}\n\nAssistant: {assistant_ctx}\n\nHuman: {followup}\n\nAssistant:"

    cont_result = await collect_completion_run(
        client,
        request,
        cont_prompt,
        capture_events=False,
        on_delta=on_delta,
    )
    cont_text = cont_result.state.answer_text
    if not cont_text or not cont_text.strip():
        log.info("[TruncRecover] empty continuation, stopping")
        return result, False

    deduped = deduplicate_continuation(state.answer_text, cont_text)
    if not deduped.strip():
        log.info("[TruncRecover] continuation fully overlapped existing, stopping")
        return result, False
    return _merge_continuation_result(result, cont_result, deduped), True


async def collect_completion_run_with_recovery(
    client,
    request: StandardRequest,
    prompt: str,
    *,
    capture_events: bool = True,
    on_delta: Callable[[dict[str, Any], str | None, list[dict[str, Any]] | None], Awaitable[None]] | None = None,
    max_continuation: int = 2,
    warmup_chars: int = 0,
    guard_chars: int = 0,
) -> RuntimeExecutionResult:
    from backend.runtime.execution import collect_completion_run
    from backend.services.truncation_recovery import (
        build_continuation_prompt,
        deduplicate_continuation,
        is_truncated,
    )

    wrapped_on_delta, streamer = _build_warmup_delta_handler(
        on_delta,
        warmup_chars=warmup_chars,
        guard_chars=guard_chars,
    )
    result = await collect_completion_run(
        client,
        request,
        prompt,
        capture_events=capture_events,
        on_delta=wrapped_on_delta,
    )
    await _flush_warmup_tail(streamer, on_delta)

    continues = 0
    while continues < max_continuation and _should_continue_recovery(result, request, is_truncated):
        continues += 1
        log.info(
            "[TruncRecover] detected unclosed tool call, continuation attempt=%d chat_id=%s len=%d",
            continues,
            result.chat_id,
            len(result.state.answer_text),
        )
        result, changed = await _run_continuation(
            client=client,
            request=request,
            prompt=prompt,
            result=result,
            on_delta=on_delta,
            collect_completion_run=collect_completion_run,
            build_continuation_prompt=build_continuation_prompt,
            deduplicate_continuation=deduplicate_continuation,
        )
        if not changed:
            break
        log.info(
            "[TruncRecover] continuation=%d total=%d",
            continues,
            len(result.state.answer_text),
        )

    return result
