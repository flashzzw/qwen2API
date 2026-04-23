import base64
import hashlib
import hmac
import time

from fastapi import HTTPException, Request, Response

from backend.core.config import settings

ADMIN_SESSION_COOKIE = "qwen2api_admin_session"
ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 12
_SESSION_SCOPE = "admin"
_SESSION_VERSION = "v1"


def _sign_session_payload(payload: str) -> str:
    return hmac.new(
        settings.ADMIN_KEY.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _encode_session_token(expires_at: int) -> str:
    payload = f"{_SESSION_VERSION}:{_SESSION_SCOPE}:{expires_at}"
    signed = f"{payload}:{_sign_session_payload(payload)}"
    raw = base64.urlsafe_b64encode(signed.encode("utf-8")).decode("ascii")
    return raw.rstrip("=")


def _decode_session_token(token: str) -> tuple[str, str, int, str] | None:
    if not token:
        return None

    padding = "=" * (-len(token) % 4)
    try:
        decoded = base64.urlsafe_b64decode((token + padding).encode("ascii")).decode("utf-8")
        version, scope, expires_at_text, signature = decoded.split(":", 3)
        return version, scope, int(expires_at_text), signature
    except (ValueError, UnicodeDecodeError):
        return None


def has_valid_admin_session(request: Request) -> bool:
    session = request.cookies.get(ADMIN_SESSION_COOKIE, "")
    parsed = _decode_session_token(session)
    if parsed is None:
        return False

    version, scope, expires_at, signature = parsed
    if version != _SESSION_VERSION or scope != _SESSION_SCOPE or expires_at < int(time.time()):
        return False

    expected = _sign_session_payload(f"{version}:{scope}:{expires_at}")
    return hmac.compare_digest(signature, expected)


def resolve_admin_session_token(request: Request) -> str | None:
    if has_valid_admin_session(request):
        return settings.ADMIN_KEY
    return None


def _extract_request_token(request: Request) -> str:
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:].strip()

    token = request.headers.get("x-api-key", "").strip()
    if token:
        return token

    return request.query_params.get("key", "").strip() or request.query_params.get("api_key", "").strip()


def require_admin_token(request: Request) -> str:
    session_token = resolve_admin_session_token(request)
    if session_token:
        return session_token

    token = _extract_request_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Unauthorized")

    if token == settings.ADMIN_KEY:
        return token

    raise HTTPException(status_code=403, detail="Forbidden: Admin Key Mismatch")


def _is_secure_request(request: Request) -> bool:
    forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",", 1)[0].strip()
    scheme = forwarded_proto or request.url.scheme
    return scheme == "https"


def set_admin_session_cookie(response: Response, request: Request) -> None:
    response.set_cookie(
        key=ADMIN_SESSION_COOKIE,
        value=_encode_session_token(int(time.time()) + ADMIN_SESSION_TTL_SECONDS),
        max_age=ADMIN_SESSION_TTL_SECONDS,
        httponly=True,
        samesite="lax",
        secure=_is_secure_request(request),
        path="/",
    )


def clear_admin_session_cookie(response: Response, request: Request) -> None:
    response.delete_cookie(
        key=ADMIN_SESSION_COOKIE,
        httponly=True,
        samesite="lax",
        secure=_is_secure_request(request),
        path="/",
    )
