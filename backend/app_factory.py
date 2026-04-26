from __future__ import annotations

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import backend.api.models as models
from backend.api import admin, anthropic, embeddings, files_api, gemini, images, probes, v1_chat
from backend.application.container import application_lifespan
from backend.core.config import get_cors_allowed_origins

log = logging.getLogger("qwen2api")


def create_app() -> FastAPI:
    app = FastAPI(
        title="qwen2API Enterprise Gateway",
        version="2.0.0",
        lifespan=application_lifespan,
    )
    _configure_middleware(app)
    _include_routes(app)
    _mount_frontend(app)
    return app


def _configure_middleware(app: FastAPI) -> None:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=get_cors_allowed_origins(),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-API-Key", "X-Requested-With"],
    )


def _include_routes(app: FastAPI) -> None:
    app.include_router(v1_chat.router, tags=["OpenAI Compatible"])
    app.include_router(models.router, tags=["Models"])
    app.include_router(anthropic.router, tags=["Claude Compatible"])
    app.include_router(gemini.router, tags=["Gemini Compatible"])
    app.include_router(embeddings.router, tags=["Embeddings"])
    app.include_router(images.router, tags=["Images"])
    app.include_router(files_api.router, tags=["Files"])
    app.include_router(probes.router, tags=["Probes"])
    app.include_router(admin.router, prefix="/api/admin", tags=["Dashboard Admin"])

    @app.get("/api", tags=["System"])
    async def root():
        return {
            "status": "qwen2API Enterprise Gateway is running",
            "docs": "/docs",
            "version": "2.0.0",
        }


def _mount_frontend(app: FastAPI) -> None:
    frontend_dist = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")
    if os.path.exists(frontend_dist):
        app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
    else:
        log.warning("未找到前端构建目录: %s，WebUI 将不可用。", frontend_dist)
