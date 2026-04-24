from __future__ import annotations

import asyncio
from types import SimpleNamespace

import httpx
from fastapi import FastAPI
from fastapi import HTTPException
from starlette.requests import Request

from backend.api import admin, images
from backend.core.config import settings
from backend.services.auth_quota import resolve_auth_context


class FakeUsersDB:
    def __init__(self, users: list[dict] | None = None) -> None:
        self._users = users or []

    async def get(self) -> list[dict]:
        return self._users

    async def save(self, users: list[dict]) -> None:
        self._users = users


def build_test_app() -> FastAPI:
    app = FastAPI()
    app.include_router(admin.router, prefix="/api/admin")
    app.include_router(images.router)
    app.state.users_db = FakeUsersDB([])
    app.state.qwen_client = SimpleNamespace()
    return app


def test_admin_login_sets_session_cookie() -> None:
    async def run() -> httpx.Response:
        app = build_test_app()
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            return await client.post("/api/admin/auth/login", json={"password": settings.ADMIN_KEY})

    response = asyncio.run(run())

    assert response.status_code == 200
    assert "qwen2api_admin_session" in response.cookies
    assert response.json() == {"ok": True}


def test_images_requires_admin_auth_without_session() -> None:
    async def run() -> httpx.Response:
        app = build_test_app()
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            return await client.post("/v1/images/generations", json={"prompt": "draw a cat"})

    response = asyncio.run(run())

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid API Key"


def test_images_accepts_admin_session_cookie() -> None:
    async def run() -> httpx.Response:
        app = build_test_app()
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            await client.post("/api/admin/auth/login", json={"password": settings.ADMIN_KEY})
            return await client.post("/v1/images/generations", json={"prompt": "draw a cat"})

    response = asyncio.run(run())

    assert response.status_code != 401


def test_admin_auth_context_rejects_arbitrary_token() -> None:
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "headers": [(b"authorization", b"Bearer fake-token")],
            "query_string": b"",
        }
    )

    try:
        asyncio.run(resolve_auth_context(request, FakeUsersDB([])))
    except HTTPException as exc:
        assert exc.status_code == 401
        assert exc.detail == "Invalid API Key"
    else:
        raise AssertionError("expected Invalid API Key")


def test_admin_auth_context_accepts_user_token() -> None:
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "headers": [(b"authorization", b"Bearer sk-user-token")],
            "query_string": b"",
        }
    )

    context = asyncio.run(
        resolve_auth_context(
            request,
            FakeUsersDB(
                [
                    {
                        "id": "sk-user-token",
                        "quota": 100,
                        "used_tokens": 0,
                    }
                ]
            ),
        )
    )

    assert context.token == "sk-user-token"
    assert context.user is not None
