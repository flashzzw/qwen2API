from __future__ import annotations

import json
import logging
from typing import Any

from backend.adapter.standard_request import StandardRequest
from backend.runtime.types import RuntimeAttemptState, RuntimeToolDirective
from backend.services import tool_parser
from backend.services.tool_name_obfuscation import from_qwen_name
from backend.toolcall.normalize import normalize_tool_name

log = logging.getLogger("qwen2api.runtime")


def native_tool_calls_to_markup(tool_calls: list[dict[str, Any]]) -> str:
    parts: list[str] = []
    for tool_call in tool_calls:
        parts.append(
            f'<tool_call>{{"name": {json.dumps(tool_call["name"])}, "input": {json.dumps(tool_call.get("input", {}), ensure_ascii=False)}}}</tool_call>'
        )
    return "\n".join(parts)


def parse_tool_directive_once(request: StandardRequest, state: RuntimeAttemptState) -> RuntimeToolDirective:
    if state.tool_calls:
        return RuntimeToolDirective(
            tool_blocks=[
                {
                    "type": "tool_use",
                    "id": tool_call["id"],
                    "name": normalize_tool_name(from_qwen_name(tool_call["name"]), request.tool_names),
                    "input": tool_call.get("input", {}),
                }
                for tool_call in state.tool_calls
            ],
            stop_reason="tool_use",
        )

    if request.tools and state.answer_text:
        tool_blocks, stop_reason = tool_parser.parse_tool_calls_silent(state.answer_text, request.tools)
        return RuntimeToolDirective(tool_blocks=tool_blocks, stop_reason=stop_reason)

    return RuntimeToolDirective(tool_blocks=[{"type": "text", "text": state.answer_text}], stop_reason="end_turn")


def build_tool_directive(
    request: StandardRequest,
    state: RuntimeAttemptState,
) -> RuntimeToolDirective:
    directive = parse_tool_directive_once(request, state)
    log.info(
        f"[ToolDirective] tool_blocks={len(directive.tool_blocks)} stop_reason={directive.stop_reason} "
        f"has_tool_use={any(b.get('type') == 'tool_use' for b in directive.tool_blocks)}"
    )
    return directive
