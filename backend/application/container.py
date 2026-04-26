from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any, AsyncIterator

from fastapi import FastAPI

from backend.core.account_pool import AccountPool
from backend.core.config import API_KEYS_FILE, configure_api_keys_store, settings
from backend.core.database import AsyncJsonDB, AsyncMongoDB, LocalApiKeyStore, MongoApiKeyStore
from backend.core.request_logging import request_context
from backend.core.session_affinity import SessionAffinityStore
from backend.core.session_lock import SessionLockRegistry
from backend.core.upstream_file_cache import UpstreamFileCache
from backend.services.chat_id_pool import ChatIdPool
from backend.services.context_cleanup import context_cleanup_loop
from backend.services.context_offload import ContextOffloader
from backend.services.file_store import LocalFileStore, MongoGridFSFileStore
from backend.services.garbage_collector import garbage_collect_chats
from backend.integrations.qwen.client import QwenClient
from backend.integrations.qwen.file_uploader import UpstreamFileUploader

log = logging.getLogger("qwen2api")


@dataclass(slots=True)
class ApplicationContainer:
    mongo_client: Any | None
    mongo_db: Any | None


def _build_state_db(*, mongo_db: Any | None, collection_name: str, local_path: str, default_data: Any):
    if mongo_db is not None:
        return AsyncMongoDB(mongo_db[collection_name], default_data=default_data)
    return AsyncJsonDB(local_path, default_data=default_data)


def _connect_mongo_if_configured() -> ApplicationContainer:
    if not settings.MONGODB_URI:
        configure_api_keys_store(LocalApiKeyStore(API_KEYS_FILE))
        return ApplicationContainer(mongo_client=None, mongo_db=None)

    from pymongo import MongoClient

    log.info(
        "检测到 MongoDB Atlas 配置，启用远程持久化 db=%s timeout_ms=%s",
        settings.MONGODB_DB_NAME,
        settings.MONGODB_CONNECT_TIMEOUT_MS,
    )
    mongo_client = MongoClient(
        settings.MONGODB_URI,
        serverSelectionTimeoutMS=settings.MONGODB_CONNECT_TIMEOUT_MS,
        connectTimeoutMS=settings.MONGODB_CONNECT_TIMEOUT_MS,
    )
    mongo_client.admin.command("ping")
    mongo_db = mongo_client[settings.MONGODB_DB_NAME]
    configure_api_keys_store(MongoApiKeyStore(mongo_db["api_keys"]))
    return ApplicationContainer(mongo_client=mongo_client, mongo_db=mongo_db)


def _attach_datastores(app: FastAPI, mongo_db: Any | None) -> None:
    app.state.accounts_db = _build_state_db(
        mongo_db=mongo_db,
        collection_name="accounts",
        local_path=settings.ACCOUNTS_FILE,
        default_data=[],
    )
    app.state.users_db = _build_state_db(
        mongo_db=mongo_db,
        collection_name="users",
        local_path=settings.USERS_FILE,
        default_data=[],
    )
    app.state.captures_db = _build_state_db(
        mongo_db=mongo_db,
        collection_name="captures",
        local_path=settings.CAPTURES_FILE,
        default_data=[],
    )
    app.state.session_affinity_db = _build_state_db(
        mongo_db=mongo_db,
        collection_name="session_affinity",
        local_path=settings.CONTEXT_AFFINITY_FILE,
        default_data=[],
    )
    app.state.context_cache_db = _build_state_db(
        mongo_db=mongo_db,
        collection_name="context_cache",
        local_path=settings.CONTEXT_CACHE_FILE,
        default_data=[],
    )
    app.state.uploaded_files_db = _build_state_db(
        mongo_db=mongo_db,
        collection_name="uploaded_files",
        local_path=settings.UPLOADED_FILES_FILE,
        default_data=[],
    )


def _attach_services(app: FastAPI, mongo_db: Any | None) -> None:
    app.state.account_pool = AccountPool(app.state.accounts_db, max_inflight=settings.MAX_INFLIGHT_PER_ACCOUNT)
    app.state.qwen_client = QwenClient(app.state.account_pool)
    app.state.qwen_executor = app.state.qwen_client.executor
    if mongo_db is not None:
        app.state.file_store = MongoGridFSFileStore(mongo_db, app.state.uploaded_files_db)
    else:
        app.state.file_store = LocalFileStore(settings.CONTEXT_GENERATED_DIR, app.state.uploaded_files_db)
    app.state.session_affinity = SessionAffinityStore(app.state.session_affinity_db)
    app.state.upstream_file_cache = UpstreamFileCache(app.state.context_cache_db)
    app.state.context_offloader = ContextOffloader(settings)
    app.state.upstream_file_uploader = UpstreamFileUploader(app.state.qwen_client, settings)
    app.state.session_locks = SessionLockRegistry()


async def _load_services(app: FastAPI) -> None:
    await app.state.account_pool.load()
    await app.state.file_store.load()
    await app.state.session_affinity.load()
    await app.state.upstream_file_cache.load()


async def _start_background_tasks(app: FastAPI) -> None:
    asyncio.create_task(garbage_collect_chats(app))
    asyncio.create_task(context_cleanup_loop(app))

    app.state.chat_id_pool = ChatIdPool(
        app.state.qwen_client,
        target_per_account=5,
        ttl_seconds=600,
        default_model="qwen3.6-plus",
    )
    app.state.qwen_executor.chat_id_pool = app.state.chat_id_pool
    await app.state.chat_id_pool.start()


async def initialize_application_state(app: FastAPI) -> None:
    container = _connect_mongo_if_configured()
    app.state.mongo_client = container.mongo_client
    app.state.mongo_db = container.mongo_db
    _attach_datastores(app, container.mongo_db)
    _attach_services(app, container.mongo_db)
    await _load_services(app)
    await _start_background_tasks(app)


async def shutdown_application_state(app: FastAPI) -> None:
    pool = getattr(app.state, "chat_id_pool", None)
    if pool:
        await pool.stop()

    qwen_client = getattr(app.state, "qwen_client", None)
    if qwen_client is not None:
        await qwen_client._http_client.aclose()
        log.info("HTTP 连接池已关闭")

    mongo_client = getattr(app.state, "mongo_client", None)
    if mongo_client is not None:
        mongo_client.close()
        log.info("MongoDB 连接已关闭")


@asynccontextmanager
async def application_lifespan(app: FastAPI) -> AsyncIterator[None]:
    with request_context(surface="startup"):
        log.info("正在启动 qwen2API v2.0 企业网关...")
        await initialize_application_state(app)

    yield

    with request_context(surface="shutdown"):
        log.info("正在关闭网关服务...")
        await shutdown_application_state(app)
