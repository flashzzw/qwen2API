import json

from backend.protocols.common.cli_proxy import CLIProxy
from backend.protocols.common.standard_request import CLAUDE_CODE_OPENAI_PROFILE
from backend.protocols.openai.stream_translator import OpenAIStreamTranslator
from backend.adapter.cli_proxy import CLIProxy as LegacyCLIProxy
from backend.adapter.standard_request import StandardRequest as LegacyStandardRequest
from backend.protocols.common.standard_request import StandardRequest
from backend.runtime.execution import (
    RuntimeAttemptState,
    build_tool_directive,
    build_usage_delta_factory,
    collect_completion_run,
    cleanup_runtime_resources,
    evaluate_retry_directive,
    parse_tool_directive_once,
    request_max_attempts,
)
from backend.runtime.cleanup import cleanup_runtime_resources as cleanup_runtime_resources_new
from backend.runtime.runner import collect_completion_run as collect_completion_run_new
from backend.runtime.retry import evaluate_retry_directive as evaluate_retry_directive_new
from backend.runtime.tool_directive import build_tool_directive as build_tool_directive_new
from backend.runtime.types import RuntimeAttemptState as RuntimeAttemptStateNew
from backend.runtime.usage import build_usage_delta_factory as build_usage_delta_factory_new
from backend.runtime.types import RuntimeToolDirective
from backend.application.completions.request_builder import build_chat_standard_request
from backend.application.completions.prompt_builder import messages_to_prompt
from backend.services.standard_request_builder import build_chat_standard_request as legacy_build_chat_standard_request
from backend.services.completion_bridge import run_retryable_completion_bridge as legacy_run_retryable_completion_bridge
from backend.services.prompt_builder import messages_to_prompt as legacy_messages_to_prompt
from backend.application.completions.bridge import run_retryable_completion_bridge
from backend.integrations.qwen.auth import AuthResolver
from backend.integrations.qwen.client import QwenClient
from backend.integrations.qwen.executor import QwenExecutor
from backend.integrations.qwen.file_uploader import UpstreamFileUploader
from backend.integrations.qwen.payload_builder import build_chat_payload
from backend.integrations.qwen.sse_consumer import parse_sse_chunk
from backend.services.auth_resolver import AuthResolver as LegacyAuthResolver
from backend.services.qwen_client import QwenClient as LegacyQwenClient
from backend.services.upstream_file_uploader import UpstreamFileUploader as LegacyUpstreamFileUploader
from backend.upstream.payload_builder import build_chat_payload as legacy_build_chat_payload
from backend.upstream.qwen_executor import QwenExecutor as LegacyQwenExecutor
from backend.upstream.sse_consumer import parse_sse_chunk as legacy_parse_sse_chunk
from backend.services.tool_parser import parse_tool_calls_silent


def _read_tool() -> dict:
    return {
        "type": "function",
        "function": {
            "name": "Read",
            "description": "Read a file",
            "parameters": {
                "type": "object",
                "properties": {"file_path": {"type": "string"}},
                "required": ["file_path"],
            },
        },
    }


def test_openai_standard_request_preserves_model_stream_and_tools():
    payload = {
        "model": "gpt-4o",
        "stream": True,
        "messages": [{"role": "user", "content": "read README.md"}],
        "tools": [_read_tool()],
    }

    request = build_chat_standard_request(
        payload,
        default_model="gpt-3.5-turbo",
        surface="openai",
        client_profile=CLAUDE_CODE_OPENAI_PROFILE,
    )

    assert request.surface == "openai"
    assert request.response_model == "gpt-4o"
    assert request.resolved_model == "qwen3.6-plus"
    assert request.stream is True
    assert request.tool_enabled is True
    assert request.tool_names == ["Read"]
    assert "fs_open_file" in request.prompt
    assert "read README.md" in request.prompt


def test_anthropic_standard_request_normalizes_messages_and_tools():
    payload = {
        "model": "claude-3.5-sonnet",
        "system": "Be terse.",
        "messages": [{"role": "user", "content": [{"type": "text", "text": "open pyproject"}]}],
        "tools": [
            {
                "name": "Bash",
                "description": "Run shell",
                "input_schema": {
                    "type": "object",
                    "properties": {"command": {"type": "string"}},
                    "required": ["command"],
                },
            }
        ],
    }

    request = CLIProxy.from_anthropic(payload, client_profile=CLAUDE_CODE_OPENAI_PROFILE)

    assert request.surface == "anthropic"
    assert request.response_model == "claude-3.5-sonnet"
    assert request.resolved_model == "qwen3.6-plus"
    assert request.tool_names == ["Bash"]
    assert "shell_run" in request.prompt
    assert "open pyproject" in request.prompt


def test_gemini_standard_request_extracts_user_text_and_stream_flag():
    payload = {
        "contents": [
            {"role": "model", "parts": [{"text": "ignored"}]},
            {"role": "user", "parts": [{"text": "hello"}, {"text": "world"}]},
        ],
        "generationConfig": {"stream": True},
    }

    request = CLIProxy.from_gemini("gemini-1.5-pro", payload)

    assert request.surface == "gemini"
    assert request.response_model == "gemini-1.5-pro"
    assert request.resolved_model == "gemini-1.5-pro"
    assert request.prompt == "hello\nworld"
    assert request.stream is True
    assert request.tool_enabled is False


def test_tool_call_parser_accepts_qwen_alias_and_coerces_args():
    tools = [_read_tool()["function"]]
    answer = '##TOOL_CALL##\n{"name":"fs_open_file","input":{"path":"README.md"}}\n##END_CALL##'

    blocks, stop_reason = parse_tool_calls_silent(answer, tools)

    assert stop_reason == "tool_use"
    assert blocks[0]["type"] == "tool_use"
    assert blocks[0]["name"] == "Read"
    assert blocks[0]["input"] == {"file_path": "README.md"}


def test_runtime_directive_uses_native_tool_calls_before_text_parser():
    request = build_chat_standard_request(
        {"messages": [{"role": "user", "content": "run pwd"}], "tools": [_read_tool()]},
        default_model="gpt-3.5-turbo",
        surface="openai",
        client_profile=CLAUDE_CODE_OPENAI_PROFILE,
    )
    state = RuntimeAttemptState(
        answer_text="ignored",
        tool_calls=[{"id": "toolu_1", "name": "fs_open_file", "input": {"file_path": "README.md"}}],
    )

    directive = parse_tool_directive_once(request, state)

    assert directive.stop_reason == "tool_use"
    assert directive.tool_blocks == [
        {"type": "tool_use", "id": "toolu_1", "name": "Read", "input": {"file_path": "README.md"}}
    ]


def test_openai_stream_final_directive_emits_tool_call_delta():
    translator = OpenAIStreamTranslator(
        completion_id="chatcmpl-test",
        created=1,
        model_name="qwen3.6-plus",
        client_profile=CLAUDE_CODE_OPENAI_PROFILE,
        allowed_tool_names=["Read"],
    )
    directive = RuntimeToolDirective(
        tool_blocks=[
            {
                "type": "tool_use",
                "id": "toolu_1",
                "name": "Read",
                "input": {"file_path": "README.md"},
            }
        ],
        stop_reason="tool_use",
    )

    payloads = []
    for chunk in translator.finalize("tool_calls", final_directive=directive):
        for line in chunk.splitlines():
            if line.startswith("data: ") and line != "data: [DONE]":
                payloads.append(json.loads(line[6:]))

    tool_deltas = [
        payload["choices"][0]["delta"]["tool_calls"]
        for payload in payloads
        if payload["choices"][0]["delta"].get("tool_calls")
    ]
    assert tool_deltas == [
        [
            {
                "index": 0,
                "id": "toolu_1",
                "type": "function",
                "function": {
                    "name": "Read",
                    "arguments": json.dumps({"file_path": "README.md"}, ensure_ascii=False),
                },
            }
        ]
    ]
    assert payloads[-1]["choices"][0]["finish_reason"] == "tool_calls"


def test_retry_directive_reprompts_for_unparsed_tool_markup():
    request = build_chat_standard_request(
        {"messages": [{"role": "user", "content": "read file"}], "tools": [_read_tool()]},
        default_model="gpt-3.5-turbo",
        surface="openai",
        client_profile=CLAUDE_CODE_OPENAI_PROFILE,
    )
    state = RuntimeAttemptState(answer_text="##TOOL_CALL##\nnot json\n##END_CALL##")

    retry = evaluate_retry_directive(
        request=request,
        current_prompt=request.prompt,
        history_messages=[],
        attempt_index=0,
        max_attempts=request_max_attempts(request),
        state=state,
        allow_after_visible_output=True,
    )

    assert retry.retry is True
    assert retry.reason == "invalid_textual_tool_contract:Read"
    assert retry.next_prompt != request.prompt


def test_runtime_new_modules_match_execution_compat_exports():
    assert RuntimeAttemptState is RuntimeAttemptStateNew
    assert evaluate_retry_directive is evaluate_retry_directive_new
    assert collect_completion_run is collect_completion_run_new
    assert build_tool_directive is build_tool_directive_new
    assert cleanup_runtime_resources is cleanup_runtime_resources_new
    assert build_usage_delta_factory is build_usage_delta_factory_new


def test_protocol_and_completion_legacy_paths_reexport_new_modules():
    assert LegacyCLIProxy is CLIProxy
    assert LegacyStandardRequest is StandardRequest
    assert legacy_build_chat_standard_request is build_chat_standard_request
    assert legacy_run_retryable_completion_bridge is run_retryable_completion_bridge
    assert legacy_messages_to_prompt is messages_to_prompt


def test_qwen_integration_legacy_paths_reexport_new_modules():
    assert LegacyAuthResolver is AuthResolver
    assert LegacyQwenClient is QwenClient
    assert LegacyQwenExecutor is QwenExecutor
    assert LegacyUpstreamFileUploader is UpstreamFileUploader
    assert legacy_build_chat_payload is build_chat_payload
    assert legacy_parse_sse_chunk is parse_sse_chunk
