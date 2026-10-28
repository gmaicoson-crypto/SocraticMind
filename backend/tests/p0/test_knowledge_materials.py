"""Explicit knowledge scope, revision and retrieval evidence contracts."""

import json
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from core.config import settings
from core.context_budget import count_text
from core.errors import ApiError
from models import Attachment, AttachmentChunk, Topic, User
from schemas.knowledge import MaterialRef, RetrievalRequest
from services.knowledge.materials import replace_topic_materials, topic_refs
from services.knowledge.retrieval import retrieve, revalidate_sources


@pytest.fixture(autouse=True)
def configure(monkeypatch):
    monkeypatch.setattr(
        settings,
        "llm_models",
        json.dumps(
            [
                {
                    "id": "knowledge-test",
                    "name": "知识测试",
                    "model": "test-model",
                    "api_key": "test",
                    "base_url": "https://example.test/v1",
                    "tokenizer_encoding": "utf8_bytes",
                }
            ]
        ),
    )
    monkeypatch.setattr(settings, "llm_default_model_id", "knowledge-test")


def make_document(db, user, texts=None, **overrides):
    identifier = str(uuid4())
    values = dict(
        id=identifier,
        user_id=user.id,
        client_upload_id=identifier,
        draft_session_id="original-session",
        mode="normal",
        name="讲义.pdf",
        mime_type="application/pdf",
        kind="document",
        size=100,
        sha256="a" * 64,
        storage_key=f"{identifier}/original.pdf",
        status="ready",
        revision=1,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    values.update(overrides)
    document = Attachment(**values)
    db.add(document)
    db.flush()
    for index, text in enumerate(
        texts or ["梯度下降通过梯度方向更新参数。", "学习率决定更新步长。"]
    ):
        db.add(
            AttachmentChunk(
                attachment_id=identifier,
                revision=1,
                chunk_id=f"c{index + 1}",
                position=index,
                text=text,
                locator={"page": index + 1},
                block_type="page",
                title_path=[],
                asset_refs=[],
            )
        )
    db.commit()
    return document


def ref(document):
    return MaterialRef(attachment_id=document.id, revision=document.revision)


def make_topic(db, user):
    topic = Topic(user_id=user.id, title="学习主题", emoji="📚")
    db.add(topic)
    db.commit()
    return topic


def test_api_can_bind_replace_and_list_private_materials(client, db_session, auth_user):
    document = make_document(db_session, auth_user)
    topic = make_topic(db_session, auth_user)
    assert client.get("/api/knowledge/documents").json()[0]["id"] == document.id
    payload = {"materials": [ref(document).model_dump()]}
    response = client.put(f"/api/knowledge/topics/{topic.id}/materials", json=payload)
    assert response.status_code == 200
    assert response.json()[0]["available"] is True
    db_session.refresh(document)
    assert document.expires_at is None
    assert (
        client.put(f"/api/knowledge/topics/{topic.id}/materials", json=payload).status_code == 200
    )
    assert len(topic_refs(db_session, user_id=auth_user.id, topic_id=topic.id)) == 1

    response = client.post(f"/api/knowledge/topics/{topic.id}/retrieve", json={"query": "梯度下降"})
    assert response.status_code == 200
    assert response.json()["status"] == "ready"
    assert response.json()["sources"][0]["attachment_id"] == document.id

    assert (
        client.put(
            f"/api/knowledge/topics/{topic.id}/materials", json={"materials": []}
        ).status_code
        == 200
    )
    db_session.refresh(document)
    assert document.expires_at is not None
    assert client.get(f"/api/knowledge/topics/{topic.id}/materials").json() == []


def test_cannot_bind_foreign_documents_or_access_foreign_topic(client, db_session, auth_user):
    other = User(username="other-knowledge", email="other@example.test", hashed_password="test")
    db_session.add(other)
    db_session.commit()
    foreign = make_document(db_session, other)
    topic = make_topic(db_session, auth_user)
    other_topic = make_topic(db_session, other)
    response = client.put(
        f"/api/knowledge/topics/{topic.id}/materials",
        json={"materials": [ref(foreign).model_dump()]},
    )
    assert response.status_code == 404
    assert client.get("/api/knowledge/documents").json() == []
    assert client.get(f"/api/knowledge/topics/{other_topic.id}/materials").status_code == 404
    assert topic_refs(db_session, user_id=auth_user.id, topic_id=topic.id) == []


def test_no_evidence_and_exact_missing_page_are_explicit(db_session, auth_user):
    document = make_document(db_session, auth_user)
    for query in ["quantum entanglement", "第99页"]:
        result = retrieve(
            db_session,
            user_id=auth_user.id,
            materials=[ref(document)],
            request=RetrievalRequest(query=query),
            model_id="knowledge-test",
        )
        assert result.status == "no_evidence"
        assert result.sources == []
    result = retrieve(
        db_session,
        user_id=auth_user.id,
        materials=[ref(document)],
        request=RetrievalRequest(query="第2页"),
        model_id="knowledge-test",
    )
    assert [source["locator"] for source in result.sources] == [{"page": 2}]


@pytest.mark.parametrize("change", ["deleted", "revision", "unbound"])
def test_saved_evidence_is_revoked_when_material_changes(db_session, auth_user, change):
    document = make_document(db_session, auth_user)
    topic = make_topic(db_session, auth_user)
    replace_topic_materials(
        db_session, user_id=auth_user.id, topic_id=topic.id, materials=[ref(document)]
    )
    result = retrieve(
        db_session,
        user_id=auth_user.id,
        materials=[ref(document)],
        topic_id=topic.id,
        request=RetrievalRequest(query="梯度下降"),
        model_id="knowledge-test",
    )
    if change == "unbound":
        replace_topic_materials(db_session, user_id=auth_user.id, topic_id=topic.id, materials=[])
    else:
        if change == "deleted":
            document.status = "deleted"
        else:
            document.revision += 1
        db_session.commit()
    with pytest.raises(ApiError):
        revalidate_sources(
            db_session, user_id=auth_user.id, sources=result.sources, topic_id=topic.id
        )


def test_evidence_uses_live_text_and_rejects_forged_location(db_session, auth_user):
    document = make_document(db_session, auth_user)
    result = retrieve(
        db_session,
        user_id=auth_user.id,
        materials=[ref(document)],
        request=RetrievalRequest(query="梯度下降"),
        model_id="knowledge-test",
    )
    tampered = deepcopy(result.sources)
    tampered[0]["excerpt"] = "伪造的旧检查点内容"
    assert (
        revalidate_sources(db_session, user_id=auth_user.id, sources=tampered)[0]["excerpt"]
        != tampered[0]["excerpt"]
    )
    tampered[0]["locator"] = {"page": 999}
    with pytest.raises(ApiError, match="资料位置"):
        revalidate_sources(db_session, user_id=auth_user.id, sources=tampered)


def test_plan_overview_covers_multiple_documents_with_partial_coverage(db_session, auth_user):
    first = make_document(db_session, auth_user, ["A" * 200 for _ in range(8)])
    second = make_document(db_session, auth_user, ["B" * 200 for _ in range(8)])
    result = retrieve(
        db_session,
        user_id=auth_user.id,
        materials=[ref(first), ref(second)],
        request=RetrievalRequest(query="制定学习计划", purpose="plan", token_budget=1600),
        model_id="knowledge-test",
    )
    assert {source["attachment_id"] for source in result.sources} == {first.id, second.id}
    assert all(item["selected_chunks"] < item["total_chunks"] for item in result.coverage)
    assert result.warnings
    assert count_text(json.dumps(result.sources, ensure_ascii=False), "knowledge-test") <= 1600


@pytest.mark.parametrize("case", ["duplicate", "old_revision", "expired"])
def test_invalid_material_selection_is_rejected(client, db_session, auth_user, case):
    document = make_document(db_session, auth_user)
    topic = make_topic(db_session, auth_user)
    selected = ref(document).model_dump()
    payload = [selected]
    expected = 409
    if case == "duplicate":
        payload.append(selected)
        expected = 422
    elif case == "old_revision":
        selected["revision"] = 2
    else:
        document.expires_at = datetime.now(timezone.utc) - timedelta(hours=1)
        db_session.commit()
        expected = 404
    response = client.put(
        f"/api/knowledge/topics/{topic.id}/materials", json={"materials": payload}
    )
    assert response.status_code == expected
    assert topic_refs(db_session, user_id=auth_user.id, topic_id=topic.id) == []
