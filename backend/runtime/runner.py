from __future__ import annotations

import logging
import re
import uuid
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from backend.adapter.standard_request import StandardRequest
from backend.core.request_logging import update_request_context
from backend.runtime.retry import extract_blocked_tool_names
from backend.runtime.stream_metrics import StreamMetrics
from backend.runtime.tool_directive import native_tool_calls_to_markup, parse_tool_directive_once
from backend.runtime.types import RuntimeAttemptState, RuntimeExecutionResult
from backend.services import tool_parser
from backend.toolcall.stream_state import StreamingToolCallState

log = logging.getLogger("qwen2api.runtime")

_TOXIC_REFUSAL_RE = re.compile(
    r"Tool\s+\S+\s+(?:does\s+not\s+exists?|is\s+not\s+(?:available|registered))"
    r"|I\s+cannot\s+execute\s+this\s+tool"
    r"|I[''\u2019]?\s*m\s+sorry[,. ]"
    r"|I\s+cannot\s+(?:help|assist|proceed|continue|support|perform)"
    r"|I[''\u2019]?m\s+not\s+(?:able|designed)\s+to"
    r"|unable\s+to\s+(?:proceed|continue|perform|complete)"
    r"|该工具.{0,8}?不存在|工具.{0,12}?不存在"
    r"|我(?:无法|不能|不可以)(?:继续|进行|支持|完成|操作|执行)"
    r"|无法(?:进行|支持|完成|执行).{0,10}?操作"
    r"|抱歉.{0,20}?(?:无法|不能|不支持)",
    re.IGNORECASE,
)


@dataclass
class _RunState:
    chat_id: str | None = None
    acc: Any | None = None
    answer_fragments: list[str] = field(default_factory=list)
    reasoning_fragments: list[str] = field(default_factory=list)
    native_tool_calls: list[dict[str, Any]] = field(default_factory=list)
    emitted_visible_output: bool = False
    first_event_marked: bool = False
    raw_events: list[dict[str, Any]] = field(default_factory=list)
    metrics: StreamMetrics = field(default_factory=StreamMetrics)

    @property
    def answer_text(self) -> str:
        return "".join(self.answer_fragments)

    @property
    def reasoning_text(self) -> str:
        return "".join(self.reasoning_fragments)


def _tool_calls_from_sieve(calls: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "type": "tool_use",
            "id": f"toolu_{uuid.uuid4().hex[:8]}",
            "name": call["name"],
            "input": call["input"],
        }
        for call in calls
    ]


def _flush_sieve_tool_calls(tool_sieve, detected_tool_calls: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not tool_sieve or detected_tool_calls:
        return detected_tool_calls
    for evt in tool_sieve.flush():
        if evt.get("type") != "tool_calls":
            continue
        calls = evt.get("calls", [])
        if calls:
            tool_calls = _tool_calls_from_sieve(calls)
            log.info("[Collect] ✓ Tool Sieve 刷新检测到工具调用: tools=%s", [t.get("name") for t in tool_calls])
            return tool_calls
    return detected_tool_calls


def _parse_final_text_tool_calls(request: StandardRequest, answer_text: str, detected_tool_calls: list[dict[str, Any]]) -> tuple[str, list[dict[str, Any]]]:
    if detected_tool_calls or not request.tools or not answer_text:
        return answer_text, detected_tool_calls
    tool_blocks, stop_reason = tool_parser.parse_tool_calls_silent(answer_text, request.tools)
    tool_use_blocks = [b for b in tool_blocks if b.get("type") == "tool_use"]
    if not tool_use_blocks or stop_reason != "tool_use":
        return answer_text, detected_tool_calls
    text_blocks = [b for b in tool_blocks if b.get("type") == "text"]
    cleaned_text = text_blocks[0].get("text", "") if text_blocks else ""
    log.info("[Collect] ✓ 最终文本解析检测到工具调用: tools=%s, cleaned_text_len=%s", [t.get("name") for t in tool_use_blocks], len(cleaned_text))
    return cleaned_text, tool_use_blocks


def _flush_empty_account_pool(client, acc) -> None:
    try:
        pool = getattr(client, "executor", None) and getattr(client.executor, "chat_id_pool", None)
        if pool is not None and acc is not None:
            import asyncio as _aio
            _aio.create_task(pool.flush_account(acc.email))
    except Exception:
        pass


def _finalize_result(client, request: StandardRequest, run: _RunState, tool_sieve, *, reason: str | None = None) -> RuntimeExecutionResult:
    answer_text = run.answer_text
    reasoning_text = run.reasoning_text
    if run.native_tool_calls and not answer_text:
        answer_text = native_tool_calls_to_markup(run.native_tool_calls)
    detected_tool_calls = _flush_sieve_tool_calls(tool_sieve, run.native_tool_calls)
    answer_text, detected_tool_calls = _parse_final_text_tool_calls(request, answer_text, detected_tool_calls)
    if not detected_tool_calls and not answer_text.strip() and not reasoning_text.strip():
        log.warning("[收集完成] 上游返回空输出: 原因=%s 会话=%s", reason, run.chat_id)
        if reasoning_text.strip():
            log.warning("[收集完成] 模型只返回了推理内容，没有可见输出")
        _flush_empty_account_pool(client, run.acc)
    finish_reason = "tool_calls" if detected_tool_calls else "stop"
    if reason:
        log.info("[收集完成] 原因=%s 会话=%s 工具调用=%s 答复字数=%s 推理字数=%s 结束原因=%s", reason, run.chat_id, len(detected_tool_calls), len(answer_text), len(reasoning_text), finish_reason)
    run.metrics.mark("stream_finish", float(len(run.raw_events)))
    state = RuntimeAttemptState(
        answer_text=answer_text,
        reasoning_text=reasoning_text,
        tool_calls=detected_tool_calls,
        blocked_tool_names=extract_blocked_tool_names(answer_text.strip(), request.tool_names),
        finish_reason=finish_reason,
        raw_events=run.raw_events,
        emitted_visible_output=run.emitted_visible_output,
        stage_metrics=run.metrics.summary(),
    )
    return RuntimeExecutionResult(state=state, chat_id=run.chat_id, acc=run.acc)


async def _handle_reasoning_delta(evt, content: str, run: _RunState, on_delta) -> None:
    run.reasoning_fragments.append(content)
    run.emitted_visible_output = True
    if not run.first_event_marked:
        run.metrics.mark("first_event", float(len(run.raw_events)))
        run.first_event_marked = True
    if on_delta is not None:
        await on_delta(evt, content, None)


def _detect_toxic_refusal(request: StandardRequest, run: _RunState) -> str | None:
    if not request.tools or run.emitted_visible_output or len(run.answer_text) < 20:
        return None
    early_answer = run.answer_text.strip()
    if not _TOXIC_REFUSAL_RE.search(early_answer):
        return None
    toxic_blocked = extract_blocked_tool_names(early_answer, request.tool_names)
    blocked_name = toxic_blocked[0] if toxic_blocked else "unknown"
    log.warning("[收集完成] 污染拦截 %r (未流出客户端，触发重试)", early_answer[:80])
    return f"blocked_tool_name:{blocked_name}"


def _detect_textual_tool_use(request: StandardRequest, run: _RunState, content: str) -> str | None:
    answer_text = run.answer_text
    if len(run.answer_fragments) % 3 == 0 or "does not exist" in content.lower():
        blocked_tool_names = extract_blocked_tool_names(answer_text.strip(), request.tool_names)
        if blocked_tool_names:
            return f"blocked_tool_name:{blocked_tool_names[0]}"
    if "##TOOL_CALL##" not in answer_text and "<tool_call>" not in answer_text:
        return None
    directive = parse_tool_directive_once(request, RuntimeAttemptState(answer_text=answer_text, reasoning_text=run.reasoning_text))
    return "textual_tool_use" if directive.stop_reason == "tool_use" else None


async def _handle_answer_delta(evt, content: str, request: StandardRequest, run: _RunState, tool_sieve, on_delta) -> str | None:
    run.answer_fragments.append(content)
    toxic_reason = _detect_toxic_refusal(request, run)
    if toxic_reason:
        return toxic_reason
    run.emitted_visible_output = True
    if not run.first_event_marked:
        run.metrics.mark("first_event", float(len(run.raw_events)))
        run.first_event_marked = True
    if tool_sieve:
        for sieve_evt in tool_sieve.process_chunk(content):
            if sieve_evt.get("type") == "tool_calls" and sieve_evt.get("calls"):
                run.native_tool_calls.extend(_tool_calls_from_sieve(sieve_evt["calls"]))
                log.info("[Collect] ✓ Tool Sieve 实时检测到工具调用: tools=%s", [c.get("name") for c in run.native_tool_calls])
                return "tool_sieve_detected"
    if on_delta is not None:
        await on_delta(evt, content, None)
    return _detect_textual_tool_use(request, run, content) if request.tools else None


async def _handle_native_tool_delta(evt, run: _RunState, tool_state: StreamingToolCallState, on_delta) -> bool:
    run.emitted_visible_output = True
    if not run.first_event_marked:
        run.metrics.mark("first_event", float(len(run.raw_events)))
        run.first_event_marked = True
    completed_calls = tool_state.process_event(evt)
    if not completed_calls:
        return False
    run.native_tool_calls.extend(completed_calls)
    if on_delta is not None:
        await on_delta(evt, None, completed_calls)
    return True


async def collect_completion_run(
    client,
    request: StandardRequest,
    prompt: str,
    *,
    capture_events: bool = True,
    on_delta: Callable[[dict[str, Any], str | None, list[dict[str, Any]] | None], Awaitable[None]] | None = None,
) -> RuntimeExecutionResult:
    run = _RunState()
    tool_state = StreamingToolCallState()
    tool_sieve = tool_parser.ToolSieve(request.tool_names) if request.tools else None
    if tool_sieve:
        log.info("[收集完成] 工具过滤器已启用，工具列表: %s", request.tool_names)

    async for item in client.chat_stream_events_with_retry(
        request.resolved_model,
        prompt,
        has_custom_tools=bool(request.tools),
        files=getattr(request, "upstream_files", None),
        fixed_account=getattr(request, "bound_account", None),
        existing_chat_id=getattr(request, "upstream_chat_id", None),
    ):
        reason = await _process_stream_item(item, request, run, tool_state, tool_sieve, capture_events, on_delta)
        if reason:
            return _finalize_result(client, request, run, tool_sieve, reason=reason)
    return _finalize_result(client, request, run, tool_sieve, reason="stream_end")


async def _process_stream_item(item, request: StandardRequest, run: _RunState, tool_state, tool_sieve, capture_events: bool, on_delta) -> str | None:
    if item.get("type") == "meta":
        run.chat_id = item.get("chat_id")
        run.acc = item.get("acc")
        update_request_context(chat_id=run.chat_id)
        run.metrics.mark("chat_created", float(len(run.raw_events)))
        return None
    if item.get("type") != "event":
        return None
    evt = item.get("event", {})
    if capture_events:
        run.raw_events.append(evt)
    if evt.get("type") != "delta":
        return None
    phase = evt.get("phase", "")
    content = evt.get("content", "")
    if phase in ("think", "thinking_summary") and content:
        await _handle_reasoning_delta(evt, content, run, on_delta)
    elif phase == "answer" and content:
        return await _handle_answer_delta(evt, content, request, run, tool_sieve, on_delta)
    elif phase == "tool_call":
        if await _handle_native_tool_delta(evt, run, tool_state, on_delta):
            return "native_tool_use"
    return None
