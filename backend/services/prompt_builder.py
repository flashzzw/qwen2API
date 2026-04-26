"""Compatibility exports for completion prompt construction."""

from backend.application.completions.prompt_builder import (
    CLAUDE_CODE_OPENAI_PROFILE,
    OPENCLAW_OPENAI_PROFILE,
    PromptBuildResult,
    _extract_text,
    _extract_user_text_only,
    _render_history_tool_call,
    build_prompt_with_tools,
    messages_to_prompt,
)

__all__ = [
    "CLAUDE_CODE_OPENAI_PROFILE",
    "OPENCLAW_OPENAI_PROFILE",
    "PromptBuildResult",
    "_extract_text",
    "_extract_user_text_only",
    "_render_history_tool_call",
    "build_prompt_with_tools",
    "messages_to_prompt",
]
