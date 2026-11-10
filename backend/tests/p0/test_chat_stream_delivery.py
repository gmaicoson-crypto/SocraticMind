"""The server owns an accepted reply after its SSE subscriber leaves."""

import asyncio
import json
from threading import Event
from time import monotonic, sleep

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from core.config import settings
from core.database import Base, get_db
from core.deps import get_current_user
from models import User
from routers import chat
from services.chat_streaming import delivery
from services.web_search_executor import BoundedExecutor


async def disconnect_from_stream(app, payload, after_headers):
    incoming = asyncio.Queue()
    incoming.put_nowait({"type": "http.request", "body": json.dumps(payload).encode()})
    headers = []
    disconnected = False

    async def send(message):
        nonlocal disconnected
        if message["type"] == "http.response.start":
            headers.append(message["status"])
        disconnect_now = (
            message.get("status") == 200
            if after_headers
            else b"first chunk" in message.get("body", b"")
        )
        if disconnect_now and not disconnected:
            disconnected = True
            incoming.put_nowait({"type": "http.disconnect"})

    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "method": "POST",
        "scheme": "http",
        "path": "/api/chat/stream",
        "headers": [(b"content-type", b"application/json")],
        "query_string": b"",
    }
    await asyncio.wait_for(app(scope, incoming.get, send), timeout=10)
    assert headers == [200]
    assert disconnected


@pytest.mark.parametrize(
    ("stop", "after_headers"),
    [(False, False), (False, True), (True, False)],
    ids=["finish-off-page", "leave-before-first-chunk", "explicit-stop"],
)
def test_disconnected_client_can_recover_the_same_generation(
    app, tmp_path, monkeypatch, stop, after_headers
):
    engine = create_engine(f"sqlite:///{tmp_path / 'delivery.sqlite'}")
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as db:
        user = User(username="delivery", email="delivery@example.test", hashed_password="unused")
        db.add(user)
        db.flush()
        user_id = user.id
        db.commit()
        db.expunge(user)

    def request_db():
        with Session(engine) as db:
            yield db

    app.dependency_overrides[get_db] = request_db
    app.dependency_overrides[get_current_user] = lambda: user

    workers = BoundedExecutor(1, 0)
    monkeypatch.setattr(delivery, "_workers", workers)
    release = Event()
    calls = []

    def model_stream(**_kwargs):
        calls.append(user_id)
        yield "first chunk"
        assert release.wait(15)
        yield " plus the rest"

    monkeypatch.setattr(chat, "chat_stream", model_stream)
    monkeypatch.setattr(settings, "web_search_enabled", False)
    payload = {
        "node_key": "normal",
        "topic_id": 0,
        "session_id": "detached-session",
        "request_id": "detached-request",
        "mode": "normal",
        "user_input": "question",
    }
    path = "/api/chat/requests/detached-request"
    try:
        asyncio.run(disconnect_from_stream(app, payload, after_headers))
        with TestClient(app) as client:
            status = client.get(path).json()
            assert status["status"] == "generating"
            duplicate = client.post("/api/chat/stream", json=payload)
            assert duplicate.status_code == 409
            assert duplicate.json()["code"] == "CHAT_REQUEST_RUNNING"
            busy = client.post(
                "/api/chat/stream",
                json={**payload, "session_id": "another-session", "request_id": "another-request"},
            )
            assert busy.status_code == 200
            assert '"code": "AI_BUSY"' in busy.text
            assert client.get("/api/chat/requests/another-request").json()["status"] == "failed"
            if stop:
                cancelled = client.post(
                    "/api/chat/cancel",
                    json={"session_id": payload["session_id"], "request_id": payload["request_id"]},
                )
                assert cancelled.json()["status"] == "interrupted"
                workers.shutdown()
            release.set()
            deadline = monotonic() + 5
            while status["status"] == "generating" and monotonic() < deadline:
                status = client.get(path).json()
                if status["status"] == "generating":
                    sleep(0.05)
            assert status["status"] == ("interrupted" if stop else "complete")
            assert status["error_code"] == ("USER_CANCELLED" if stop else None)
            reply = next(
                item
                for item in client.get("/api/chat/messages").json()
                if item["id"] == status["msg_ids"]["ai"]
            )
            assert reply["content"] == ("first chunk" if stop else "first chunk plus the rest")
            assert calls == [user_id]
    finally:
        release.set()
        workers.shutdown()
        engine.dispose()
