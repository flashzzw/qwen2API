from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class RuntimeAttemptState:
    answer_text: str = ""
    reasoning_text: str = ""
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    blocked_tool_names: list[str] = field(default_factory=list)
    finish_reason: str = "stop"
    raw_events: list[dict[str, Any]] = field(default_factory=list)
    emitted_visible_output: bool = False
    stage_metrics: dict[str, float] = field(default_factory=dict)


@dataclass(slots=True)
class RuntimeExecutionResult:
    state: RuntimeAttemptState
    chat_id: str | None
    acc: Any | None


@dataclass(slots=True)
class RuntimeToolDirective:
    tool_blocks: list[dict[str, Any]] = field(default_factory=list)
    stop_reason: str = "end_turn"


@dataclass(slots=True)
class RuntimeRetryDirective:
    retry: bool
    next_prompt: str
    reason: str | None = None


@dataclass(slots=True)
class RuntimeRetryContinuation:
    should_continue: bool
    next_prompt: str


@dataclass(slots=True)
class RuntimeRetryLoop:
    prompt: str
    max_attempts: int


@dataclass(slots=True)
class RuntimeAttemptPlan:
    loop: RuntimeRetryLoop
    prompt: str


@dataclass(slots=True)
class AnthropicStreamCompletionResult:
    chunks: list[str]


@dataclass(slots=True)
class AnthropicStreamSuccessResult:
    chunks: list[str]
    usage_delta: int


@dataclass(slots=True)
class RuntimeAttemptOutcome:
    execution: RuntimeExecutionResult
    continuation: RuntimeRetryContinuation


@dataclass(slots=True)
class RuntimeAttemptCursor:
    index: int
    number: int
