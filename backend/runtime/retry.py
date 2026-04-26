from __future__ import annotations

import json
import logging
import re
from typing import Any

from backend.adapter.standard_request import CLAUDE_CODE_OPENAI_PROFILE, StandardRequest
from backend.core.config import settings
from backend.runtime.types import (
    RuntimeAttemptPlan,
    RuntimeAttemptState,
    RuntimeRetryDirective,
    RuntimeRetryLoop,
    RuntimeToolDirective,
)
from backend.services import tool_parser
from backend.toolcall.normalize import normalize_tool_name

log = logging.getLogger("qwen2api.runtime")


def extract_blocked_tool_names(text: str, allowed_tool_names: list[str] | None = None) -> list[str]:
    if not text:
        return []
    if "does not exist" not in text.lower():
        return []
    blocked = re.findall(r"Tool\s+([A-Za-z0-9_.:-]+)\s+does not exists?\.?", text)
    if not blocked:
        return []
    if not allowed_tool_names:
        return blocked
    return [normalize_tool_name(name, allowed_tool_names) for name in blocked]


def _recent_message_texts(messages: list[dict[str, Any]] | None, *, limit: int = 10) -> list[str]:
    texts: list[str] = []
    checked = 0
    for msg in reversed(messages or []):
        checked += 1
        content = msg.get("content", "")
        parts: list[str] = []
        if isinstance(content, str):
            parts.append(content)
        elif isinstance(content, list):
            for part in content:
                if isinstance(part, dict):
                    if part.get("type") == "text":
                        parts.append(part.get("text", ""))
                    elif part.get("type") == "tool_result":
                        inner = part.get("content", "")
                        if isinstance(inner, str):
                            parts.append(inner)
                        elif isinstance(inner, list):
                            for inner_part in inner:
                                if isinstance(inner_part, dict) and inner_part.get("type") == "text":
                                    parts.append(inner_part.get("text", ""))
                elif isinstance(part, str):
                    parts.append(part)
        merged = "\n".join(text for text in parts if text)
        if merged:
            texts.append(merged)
        if checked >= limit:
            break
    return texts


def has_recent_unchanged_read_result(messages: list[dict[str, Any]] | None) -> bool:
    return any("Unchanged since last read" in text for text in _recent_message_texts(messages))


def has_recent_search_no_results(messages: list[dict[str, Any]] | None) -> bool:
    for text in _recent_message_texts(messages):
        lowered = text.lower()
        if "websearch" not in lowered:
            continue
        if "did 0 searches" in lowered or '"results": []' in lowered or '"matches": []' in lowered:
            return True
    return False


def tool_identity(tool_name: str, tool_input: Any = None) -> str:
    try:
        if tool_name == "Read" and isinstance(tool_input, dict):
            return f"Read::{tool_input.get('file_path', '').strip()}"
        if tool_name == "read" and isinstance(tool_input, dict):
            return f"read::{tool_input.get('path', '').strip()}"
        return f"{tool_name}::{json.dumps(tool_input or {}, ensure_ascii=False, sort_keys=True)}"
    except Exception:
        return tool_name or ""


def recent_same_tool_identity_count(messages: list[dict[str, Any]] | None, tool_name: str, tool_input: Any = None) -> int:
    target = tool_identity(tool_name, tool_input)
    count = 0
    started = False
    for msg in reversed(messages or []):
        if msg.get("role") != "assistant":
            continue
        content = msg.get("content", [])
        if not isinstance(content, list):
            if started:
                break
            continue
        tools = [b for b in content if isinstance(b, dict) and b.get("type") == "tool_use" and b.get("name")]
        if not tools:
            if started:
                break
            continue
        started = True
        if len(tools) == 1 and tool_identity(tools[0].get("name", ""), tools[0].get("input", {})) == target:
            count += 1
            continue
        break
    return count


def has_recent_openai_same_tool_call(history_messages: list[dict[str, Any]] | None, tool_name: str, tool_input: Any = None) -> bool:
    target = tool_identity(tool_name, tool_input)
    for msg in reversed(history_messages or []):
        if msg.get("role") != "assistant":
            continue
        tool_calls = msg.get("tool_calls")
        if not isinstance(tool_calls, list) or not tool_calls:
            continue
        if len(tool_calls) != 1:
            return False
        fn = tool_calls[0].get("function", {}) if isinstance(tool_calls[0], dict) else {}
        name = fn.get("name", "")
        raw_args = fn.get("arguments", "{}")
        try:
            parsed_args = json.loads(raw_args) if isinstance(raw_args, str) and raw_args else raw_args
        except (json.JSONDecodeError, ValueError):
            parsed_args = {"raw": raw_args}
        return tool_identity(name, parsed_args) == target
    return False


def has_invalid_textual_tool_contract(answer_text: str) -> bool:
    if not answer_text:
        return False
    if "##TOOL_CALL##" not in answer_text and "<tool_call>" not in answer_text:
        return False
    compact = answer_text.strip()
    tc_m = re.search(r'##TOOL_CALL##\s*(.*?)\s*##END_CALL##', compact, re.DOTALL | re.IGNORECASE)
    if tc_m:
        try:
            obj = json.loads(tc_m.group(1))
        except (json.JSONDecodeError, ValueError):
            return True
        tool_input = obj.get("input", obj.get("args", obj.get("arguments", obj.get("parameters", {}))))
        return isinstance(tool_input, str)
    xml_m = re.search(r'<tool_call>\s*(.*?)\s*</tool_call>', compact, re.DOTALL | re.IGNORECASE)
    if xml_m:
        try:
            obj = json.loads(xml_m.group(1))
        except (json.JSONDecodeError, ValueError):
            return True
        tool_input = obj.get("input", obj.get("args", obj.get("arguments", obj.get("parameters", {}))))
        return isinstance(tool_input, str)
    return False


def should_retry_textual_tool_contract(answer_text: str) -> bool:
    if not answer_text:
        return False
    if "##TOOL_CALL##" in answer_text or "<tool_call>" in answer_text:
        return True
    return False


def inject_assistant_message(prompt: str, message: str) -> str:
    next_prompt = prompt.rstrip()
    if next_prompt.endswith("Assistant:"):
        return next_prompt[:-len("Assistant:")] + message + "\nAssistant:"
    return next_prompt + "\n\n" + message + "\nAssistant:"


def retryable_usage_delta(prompt: str):
    return lambda execution, current_prompt=None: len(execution.state.answer_text) + len(current_prompt or prompt)


def request_max_attempts(request: StandardRequest) -> int:
    # 工具模式下给模型更多重试机会（毒性幻觉/重复调用场景常见）。
    return 4 if request.tools else settings.MAX_RETRIES


def plan_runtime_attempts(request: StandardRequest, *, initial_prompt: str) -> RuntimeAttemptPlan:
    loop = build_retry_loop(request, initial_prompt=initial_prompt)
    return RuntimeAttemptPlan(loop=loop, prompt=loop.prompt)


def build_retry_loop(request: StandardRequest, *, initial_prompt: str) -> RuntimeRetryLoop:
    return RuntimeRetryLoop(
        prompt=initial_prompt,
        max_attempts=request_max_attempts(request),
    )


def _parse_tool_directive_once(request: StandardRequest, state: RuntimeAttemptState) -> RuntimeToolDirective:
    from backend.runtime.execution import parse_tool_directive_once

    return parse_tool_directive_once(request, state)


def _no_retry(current_prompt: str) -> RuntimeRetryDirective:
    return RuntimeRetryDirective(retry=False, next_prompt=current_prompt, reason=None)


def _retry_directive(
    *,
    reason: str,
    next_prompt: str,
    request: StandardRequest,
    state: RuntimeAttemptState,
    attempt_index: int,
    max_attempts: int,
) -> RuntimeRetryDirective:
    log.info(
        "[重试] 原因=%s 第%s/%s次 客户端=%s 屏蔽=%s 结束原因=%s 已流出=%s",
        reason,
        attempt_index + 1,
        max_attempts,
        getattr(request, "client_profile", "-"),
        state.blocked_tool_names[:3],
        state.finish_reason,
        state.emitted_visible_output,
    )
    return RuntimeRetryDirective(retry=True, next_prompt=next_prompt, reason=reason)


def _format_reminder_prompt(request: StandardRequest, current_prompt: str, tool_name: str) -> str:
    return tool_parser.inject_format_reminder(
        current_prompt,
        tool_name,
        client_profile=getattr(request, "client_profile", CLAUDE_CODE_OPENAI_PROFILE),
    )


def _retry_blocked_tool(
    *,
    request: StandardRequest,
    current_prompt: str,
    attempt_index: int,
    max_attempts: int,
    state: RuntimeAttemptState,
) -> RuntimeRetryDirective:
    blocked_name = normalize_tool_name(state.blocked_tool_names[0], request.tool_names)
    return _retry_directive(
        reason=f"blocked_tool_name:{blocked_name}",
        next_prompt=_format_reminder_prompt(request, current_prompt, blocked_name),
        request=request,
        state=state,
        attempt_index=attempt_index,
        max_attempts=max_attempts,
    )


def _retry_textual_contract(
    *,
    request: StandardRequest,
    current_prompt: str,
    attempt_index: int,
    max_attempts: int,
    state: RuntimeAttemptState,
) -> RuntimeRetryDirective | None:
    if not state.answer_text or not should_retry_textual_tool_contract(state.answer_text):
        return None

    fallback_tool_name = request.tool_names[0] if request.tool_names else "tool"
    if has_invalid_textual_tool_contract(state.answer_text):
        return _retry_directive(
            reason=f"invalid_textual_tool_contract:{fallback_tool_name}",
            next_prompt=_format_reminder_prompt(request, current_prompt, fallback_tool_name),
            request=request,
            state=state,
            attempt_index=attempt_index,
            max_attempts=max_attempts,
        )

    directive = _parse_tool_directive_once(request, state)
    if directive.stop_reason == "tool_use":
        return None
    return _retry_directive(
        reason=f"unparsed_textual_tool_contract:{fallback_tool_name}",
        next_prompt=_format_reminder_prompt(request, current_prompt, fallback_tool_name),
        request=request,
        state=state,
        attempt_index=attempt_index,
        max_attempts=max_attempts,
    )


def _is_repeated_same_tool(
    request: StandardRequest,
    history_messages: list[dict[str, Any]] | None,
    first_tool: dict[str, Any],
) -> bool:
    if getattr(request, "client_profile", CLAUDE_CODE_OPENAI_PROFILE) == "openclaw_openai":
        return has_recent_openai_same_tool_call(
            history_messages,
            first_tool.get("name", ""),
            first_tool.get("input", {}),
        )
    return recent_same_tool_identity_count(
        history_messages,
        first_tool.get("name", ""),
        first_tool.get("input", {}),
    ) >= 1


def _user_mentioned_agent(history_messages: list[dict[str, Any]] | None) -> bool:
    for msg in reversed(history_messages or []):
        if msg.get("role") != "user":
            continue
        content = msg.get("content", "")
        if isinstance(content, str):
            text = content.lower()
        elif isinstance(content, list):
            text = " ".join(
                part.get("text", "").lower()
                for part in content
                if isinstance(part, dict) and part.get("type") == "text"
            )
        else:
            text = ""
        return any(keyword in text for keyword in ["agent", "代理", "子任务", "subtask", "background"])
    return False


def _force_tool_retry_text(first_tool: dict[str, Any], reason: str) -> str:
    name = first_tool.get("name")
    if reason == "repeated_same_tool":
        return (
            f"[强制要求]: 你已经用相同参数调用了 {name}。"
            "不要重复相同的工具调用。使用已有的工具结果，选择下一个相关工具或完成任务。"
            "如果是配置文件任务，读取一次后直接编辑/写入文件，不要重复读取。"
            f"\n[MANDATORY]: You already called {name} with the same input. "
            "Do NOT repeat the same tool call. Use the tool result you already have and either choose the next relevant tool or finish the task. "
            "If this is a config-file task, read once and then edit/write the file instead of rereading it."
        )
    if reason == "unchanged_read_result":
        return (
            "[强制要求]: 你刚收到'Unchanged since last read'（文件未改变）。不要再次读取同一个文件。现在选择其他工具或完成任务。"
            "\n[MANDATORY]: You just received 'Unchanged since last read'. Do NOT call Read again. Choose another tool or finish the task."
        )
    if reason == "auto_agent_blocked":
        return (
            "[强制要求]: 不要自动调用Agent工具。用户没有要求使用代理或子任务。请直接完成用户的请求，使用Read/Write/Edit等工具。"
            "\n[MANDATORY]: Do NOT call Agent tool automatically. User did not request agent or subtask. Complete the user's request directly using Read/Write/Edit tools."
        )
    return (
        "[强制要求]: 上次WebSearch没有返回结果。不要用类似的词再次调用WebSearch。使用其他工具或用现有信息完成回答。"
        "\n[MANDATORY]: The last WebSearch returned no results. Do NOT call WebSearch again with similar wording. Use another tool or finish with the best available answer."
    )


def _retry_tool_guard(
    *,
    reason: str,
    first_tool: dict[str, Any],
    request: StandardRequest,
    current_prompt: str,
    attempt_index: int,
    max_attempts: int,
    state: RuntimeAttemptState,
) -> RuntimeRetryDirective:
    return _retry_directive(
        reason=reason,
        next_prompt=inject_assistant_message(current_prompt, _force_tool_retry_text(first_tool, reason)),
        request=request,
        state=state,
        attempt_index=attempt_index,
        max_attempts=max_attempts,
    )


def _retry_tool_use_guard(
    *,
    request: StandardRequest,
    current_prompt: str,
    history_messages: list[dict[str, Any]] | None,
    attempt_index: int,
    max_attempts: int,
    state: RuntimeAttemptState,
) -> RuntimeRetryDirective | None:
    directive = _parse_tool_directive_once(request, state)
    if directive.stop_reason != "tool_use":
        return None
    first_tool = next((b for b in directive.tool_blocks if b.get("type") == "tool_use"), None)
    if not first_tool:
        return None
    if _is_repeated_same_tool(request, history_messages, first_tool):
        reason = f"repeated_same_tool:{first_tool.get('name', '')}"
    elif first_tool.get("name") == "Read" and has_recent_unchanged_read_result(history_messages):
        reason = "unchanged_read_result"
    elif first_tool.get("name") == "Agent" and not _user_mentioned_agent(history_messages):
        reason = "auto_agent_blocked"
    elif first_tool.get("name") == "WebSearch" and has_recent_search_no_results(history_messages):
        reason = "search_no_results"
    else:
        return None
    return _retry_tool_guard(
        reason=reason,
        first_tool=first_tool,
        request=request,
        current_prompt=current_prompt,
        attempt_index=attempt_index,
        max_attempts=max_attempts,
        state=state,
    )


def evaluate_retry_directive(
    *,
    request: StandardRequest,
    current_prompt: str,
    history_messages: list[dict[str, Any]] | None,
    attempt_index: int,
    max_attempts: int,
    state: RuntimeAttemptState,
    allow_after_visible_output: bool = False,
) -> RuntimeRetryDirective:
    if attempt_index >= max_attempts - 1:
        return _no_retry(current_prompt)

    can_retry_after_output = allow_after_visible_output or not state.emitted_visible_output
    if state.blocked_tool_names and request.tools:
        return _retry_blocked_tool(
            request=request,
            current_prompt=current_prompt,
            attempt_index=attempt_index,
            max_attempts=max_attempts,
            state=state,
        ) if can_retry_after_output else _no_retry(current_prompt)

    if request.tools and can_retry_after_output:
        retry = _retry_textual_contract(
            request=request,
            current_prompt=current_prompt,
            attempt_index=attempt_index,
            max_attempts=max_attempts,
            state=state,
        ) or _retry_tool_use_guard(
            request=request,
            current_prompt=current_prompt,
            history_messages=history_messages,
            attempt_index=attempt_index,
            max_attempts=max_attempts,
            state=state,
        )
        if retry is not None:
            return retry

    if (
        not state.answer_text
        and not state.tool_calls
        and state.finish_reason == "stop"
        and not state.emitted_visible_output
    ):
        return _retry_directive(
            reason="empty_upstream_response",
            next_prompt=current_prompt,
            request=request,
            state=state,
            attempt_index=attempt_index,
            max_attempts=max_attempts,
        )

    return _no_retry(current_prompt)
