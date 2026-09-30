import json
from types import SimpleNamespace

from routers import chat


def test_refresh_sends_visible_suggestions_to_ai_and_filters_repeats(client, monkeypatch):
    captured = {}

    def create(**kwargs):
        captured.update(kwargs)
        content = json.dumps({"suggestions": ["已经显示", "新的话题", "新的话题"]})
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])

    monkeypatch.setattr(
        chat,
        "get_ai_client",
        lambda _id: SimpleNamespace(
            chat=SimpleNamespace(completions=SimpleNamespace(create=create))
        ),
    )

    response = client.get(
        "/api/chat/suggestions",
        params=[("mode", "normal"), ("exclude", "已经显示")],
    )

    assert response.status_code == 200
    assert response.json() == {"suggestions": ["新的话题"], "source": "ai"}
    assert "已经显示" in captured["messages"][0]["content"]


def test_ai_failure_marks_static_suggestions_as_fallback(client, monkeypatch):
    def create(**_kwargs):
        raise RuntimeError("model unavailable")

    monkeypatch.setattr(
        chat,
        "get_ai_client",
        lambda _id: SimpleNamespace(
            chat=SimpleNamespace(completions=SimpleNamespace(create=create))
        ),
    )

    response = client.get("/api/chat/suggestions", params={"mode": "normal"})

    assert response.status_code == 200
    assert response.json()["source"] == "fallback"
    assert len(response.json()["suggestions"]) == 12
