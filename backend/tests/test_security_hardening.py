"""Tests for the security/auth hardening: refresh tokens, token-type
enforcement, security headers, and the rate limiter."""

import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.rate_limit import _FixedWindowLimiter

client = TestClient(app)


def _make_user():
    email = f"sec_test_{uuid.uuid4().hex[:8]}@example.com"
    pwd = "securepassword123"
    client.post("/api/auth/register", json={"email": email, "password": pwd})
    res = client.post("/api/auth/login", data={"username": email, "password": pwd})
    assert res.status_code == 200
    return email, res.json()


def test_login_returns_access_and_refresh():
    _, tokens = _make_user()
    assert tokens["access_token"]
    assert tokens["refresh_token"]
    assert tokens["access_token"] != tokens["refresh_token"]


def test_refresh_returns_working_access_token():
    _, tokens = _make_user()
    res = client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert res.status_code == 200
    new_access = res.json()["access_token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {new_access}"})
    assert me.status_code == 200


def test_refresh_token_rejected_as_access_token():
    _, tokens = _make_user()
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {tokens['refresh_token']}"})
    assert me.status_code == 401


def test_invalid_refresh_token_rejected():
    res = client.post("/api/auth/refresh", json={"refresh_token": "garbage.token.value"})
    assert res.status_code == 401


def test_security_headers_present():
    res = client.get("/health")
    assert res.headers.get("x-content-type-options") == "nosniff"
    assert res.headers.get("x-frame-options") == "DENY"


def test_rate_limiter_blocks_after_threshold():
    limiter = _FixedWindowLimiter(max_requests=3, window_seconds=60)
    for _ in range(3):
        limiter.check("k")  # allowed
    with pytest.raises(Exception):  # HTTPException 429
        limiter.check("k")
