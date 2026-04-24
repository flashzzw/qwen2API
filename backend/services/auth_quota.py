from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException, Request

from backend.core.config import API_KEYS, settings
from backend.services.admin_auth import resolve_admin_session_token


@dataclass(slots=True)
class AuthContext:
    token: str
    user: dict[str, Any] | None


def extract_api_token(request: Request) -> str:
    admin_token = resolve_admin_session_token(request)
    if admin_token:
        return admin_token

    auth_header = request.headers.get("Authorization", "")
    token = auth_header[7:].strip() if auth_header.startswith("Bearer ") else ""
    if token:
        return token

    token = request.headers.get("x-api-key", "").strip()
    if token:
        return token

    return request.query_params.get("key", "").strip() or request.query_params.get("api_key", "").strip()


async def resolve_auth_context(request: Request, users_db) -> AuthContext:
    token = extract_api_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Invalid API Key")

    users = await users_db.get()
    user = next((u for u in users if u["id"] == token), None)

    if token != settings.ADMIN_KEY and token not in API_KEYS and user is None:
        raise HTTPException(status_code=401, detail="Invalid API Key")

    if user and user.get("quota", 0) <= user.get("used_tokens", 0):
        raise HTTPException(status_code=402, detail="Quota Exceeded")

    return AuthContext(token=token, user=user)


async def add_used_tokens(users_db, token: str, delta: int) -> None:
    if delta <= 0:
        return

    users = await users_db.get()
    for user in users:
        if user["id"] == token:
            user["used_tokens"] += delta
            break
    await users_db.save(users)
