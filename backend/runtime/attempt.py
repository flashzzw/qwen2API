from __future__ import annotations

from typing import Awaitable, Callable

from backend.adapter.standard_request import StandardRequest
from backend.core.request_logging import update_request_context
from backend.runtime.cleanup import continue_after_retry_directive
from backend.runtime.retry import evaluate_retry_directive
from backend.runtime.runner import collect_completion_run
from backend.runtime.types import RuntimeAttemptCursor, RuntimeAttemptOutcome

TRAILING_IDLE_AFTER_TOOL_SECONDS = 2.0


def begin_runtime_attempt(attempt_index: int) -> RuntimeAttemptCursor:
    cursor = RuntimeAttemptCursor(index=attempt_index, number=attempt_index + 1)
    update_request_context(stream_attempt=cursor.number)
    return cursor


def should_force_finish_after_tool_use(stop_reason: str, trailing_idle_seconds: float, visible_output_after_tool: bool) -> bool:
    return stop_reason == "tool_use" and trailing_idle_seconds >= TRAILING_IDLE_AFTER_TOOL_SECONDS and not visible_output_after_tool


async def run_runtime_attempt(
    *,
    client,
    request: StandardRequest,
    current_prompt: str,
    history_messages: list[dict] | None,
    attempt_index: int,
    max_attempts: int,
    allow_after_visible_output: bool = False,
    capture_events: bool = True,
    on_delta: Callable[[dict, str | None, list[dict] | None], Awaitable[None]] | None = None,
) -> RuntimeAttemptOutcome:
    attempt_cursor = begin_runtime_attempt(attempt_index)
    execution = await collect_completion_run(
        client,
        request,
        current_prompt,
        capture_events=capture_events,
        on_delta=on_delta,
    )
    retry = evaluate_retry_directive(
        request=request,
        current_prompt=current_prompt,
        history_messages=history_messages,
        attempt_index=attempt_cursor.index,
        max_attempts=max_attempts,
        state=execution.state,
        allow_after_visible_output=allow_after_visible_output,
    )
    continuation = await continue_after_retry_directive(
        client=client,
        execution=execution,
        retry=retry,
        preserve_chat=bool(getattr(request, "persistent_session", False)),
    )
    return RuntimeAttemptOutcome(execution=execution, continuation=continuation)
