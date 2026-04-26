from __future__ import annotations

from typing import Any, Callable

from backend.runtime.types import RuntimeExecutionResult


def build_usage_delta_factory(prompt: str) -> Callable[[RuntimeExecutionResult, Any | None], int]:
    return lambda execution, current_prompt=None: len(execution.state.answer_text) + len(current_prompt or prompt)
