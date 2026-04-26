from __future__ import annotations

import asyncio
import logging

from backend.runtime.types import RuntimeRetryContinuation, RuntimeRetryDirective

log = logging.getLogger("qwen2api.runtime")


async def continue_after_retry_directive(*, client, execution, retry: RuntimeRetryDirective, preserve_chat: bool = False) -> RuntimeRetryContinuation:
    if not retry.retry:
        return RuntimeRetryContinuation(should_continue=False, next_prompt=retry.next_prompt)
    await cleanup_runtime_resources(client, execution.acc, execution.chat_id, preserve_chat=preserve_chat)
    if not preserve_chat:
        await asyncio.sleep(0.15)
    return RuntimeRetryContinuation(should_continue=True, next_prompt=retry.next_prompt)


async def cleanup_runtime_resources(client, acc, chat_id: str | None, *, preserve_chat: bool = False) -> None:
    if acc is None:
        return
    token = getattr(acc, "token", None)
    client.account_pool.release(acc)
    if preserve_chat:
        return
    if chat_id and token:
        async def _delete_chat_later() -> None:
            try:
                await client.delete_chat(token, chat_id)
            except Exception as exc:
                log.debug("[Cleanup] delete_chat failed chat_id=%s error=%s", chat_id, exc)

        asyncio.create_task(_delete_chat_later())
