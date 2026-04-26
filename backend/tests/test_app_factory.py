from fastapi import FastAPI

from backend.app_factory import create_app


def test_create_app_preserves_public_routes():
    app = create_app()

    assert isinstance(app, FastAPI)
    routes = {getattr(route, "path", "") for route in app.routes}
    assert "/api" in routes
    assert "/healthz" in routes
    assert "/readyz" in routes
    assert "/v1/chat/completions" in routes
    assert "/chat/completions" in routes
    assert "/v1/messages" in routes
    assert "/anthropic/v1/messages" in routes
    assert "/v1beta/models/{model}:generateContent" in routes
    assert "/v1/images/generations" in routes
    assert "/api/admin/accounts" in routes
