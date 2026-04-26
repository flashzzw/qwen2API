from __future__ import annotations

from backend.adapter.standard_request import StandardRequest
from backend.runtime.cleanup import cleanup_runtime_resources
from backend.runtime.tool_directive import build_tool_directive
from backend.runtime.types import (
    AnthropicStreamCompletionResult,
    AnthropicStreamSuccessResult,
    RuntimeAttemptState,
    RuntimeExecutionResult,
)


def anthropic_stream_usage_delta(prompt: str, answer_text: str) -> int:
    return len(answer_text) + len(prompt)


def anthropic_stream_stop_reason(request: StandardRequest, state: RuntimeAttemptState, pending_chunks: list[str]) -> str:
    if state.tool_calls or any('"type": "tool_use"' in chunk for chunk in pending_chunks):
        return "tool_use"
    return build_tool_directive(request, state).stop_reason


def finalize_anthropic_stream_success(*, request: StandardRequest, prompt: str, execution: RuntimeExecutionResult, translator) -> AnthropicStreamSuccessResult:
    stop_reason = anthropic_stream_stop_reason(request, execution.state, translator.pending_chunks)
    chunks = translator.finalize(answer_text=execution.state.answer_text, stop_reason=stop_reason)
    return AnthropicStreamSuccessResult(
        chunks=chunks,
        usage_delta=anthropic_stream_usage_delta(prompt, execution.state.answer_text),
    )


async def complete_anthropic_stream_success(*, users_db, token: str, client, prompt: str, request: StandardRequest, execution: RuntimeExecutionResult, translator) -> AnthropicStreamCompletionResult:
    from backend.services.auth_quota import add_used_tokens

    stream_success = finalize_anthropic_stream_success(
        request=request,
        prompt=prompt,
        execution=execution,
        translator=translator,
    )
    await add_used_tokens(users_db, token, stream_success.usage_delta)
    await cleanup_runtime_resources(client, execution.acc, execution.chat_id)
    return AnthropicStreamCompletionResult(chunks=stream_success.chunks)
