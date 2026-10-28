"""Batch cache, retry, lease and document lifecycle contracts."""

from datetime import timedelta

import pytest
from sqlalchemy.orm import sessionmaker

from core.config import settings
from models import KnowledgeEmbedding, KnowledgeIndexJob, User
from services.attachments.service import mark_deleted, utcnow
from services.knowledge.embedding_client import EmbeddingConfig, EmbeddingError, EmbeddingResult
from services.knowledge.index_store import enqueue_indexes
from services.knowledge.indexing import run_one_index_batch
from tests.p0.test_knowledge_materials import configure, make_document


@pytest.fixture
def embedding_config(monkeypatch):
    monkeypatch.setattr(settings, "knowledge_embedding_enabled", True)
    monkeypatch.setattr(
        settings, "knowledge_embedding_base_url", "https://embedding.example.test/v1"
    )
    monkeypatch.setattr(settings, "knowledge_embedding_model", "test-embedding")
    monkeypatch.setattr(settings, "knowledge_embedding_dimensions", 3)
    return EmbeddingConfig(
        base_url=settings.knowledge_embedding_base_url,
        model="test-embedding",
        api_key="",
        dimensions=3,
    )


class ControlledEmbedder:
    """Controlled provider vectors test routing; they are not semantic quality evidence."""

    def __init__(self):
        self.calls = []

    def __call__(self, config, texts):
        self.calls.append(list(texts))
        vectors = [
            [1.0, 0.0, 0.0]
            if "梯度" in text or "descending direction" in text
            else [0.0, 1.0, 0.0]
            if "学习率" in text or "step size" in text
            else [0.0, 0.0, 1.0]
            for text in texts
        ]
        return EmbeddingResult(vectors, sum(len(text) for text in texts))


def queue(db, user, document, config):
    job = enqueue_indexes(db, user_id=user.id, documents=[document], config=config)[0]
    db.commit()
    return job.id


def test_batches_cache_completed_chunks_and_never_hold_a_transaction_during_embedding(
    db_session, auth_user, embedding_config
):
    doc = make_document(db_session, auth_user, texts=[f"梯度第 {i} 章" for i in range(20)])
    job_id = queue(db_session, auth_user, doc, embedding_config)
    sessions = []
    make_session = sessionmaker(bind=db_session.get_bind(), expire_on_commit=False)

    def factory():
        db = make_session()
        sessions.append(db)
        return db

    fake = ControlledEmbedder()

    def embed(config, texts):
        assert not any(db.in_transaction() for db in sessions)
        return fake(config, texts)

    assert run_one_index_batch(factory, config=embedding_config, embedder=embed)
    assert run_one_index_batch(factory, config=embedding_config, embedder=embed)
    assert [len(call) for call in fake.calls] == [16, 4]
    assert not run_one_index_batch(factory, config=embedding_config, embedder=embed)
    db_session.expire_all()
    job = db_session.get(KnowledgeIndexJob, job_id)
    assert (job.status, job.completed_chunks, job.total_chunks, job.api_calls) == (
        "ready",
        20,
        20,
        2,
    )
    assert db_session.query(KnowledgeEmbedding).count() == 20
    queue(db_session, auth_user, doc, embedding_config)
    assert not run_one_index_batch(factory, config=embedding_config, embedder=embed)
    assert len(fake.calls) == 2


def test_failure_retries_only_missing_batch_and_counts_unknown_usage(
    db_session, auth_user, embedding_config
):
    doc = make_document(db_session, auth_user, texts=[f"内容 {i}" for i in range(18)])
    job_id = queue(db_session, auth_user, doc, embedding_config)
    factory = sessionmaker(bind=db_session.get_bind(), expire_on_commit=False)
    fake = ControlledEmbedder()
    now = utcnow()
    run_one_index_batch(factory, config=embedding_config, embedder=fake, now=now)

    def failed(*_):
        raise EmbeddingError("EMBEDDING_UNAVAILABLE")

    run_one_index_batch(factory, config=embedding_config, embedder=failed, now=now)
    assert not run_one_index_batch(factory, config=embedding_config, embedder=fake, now=now)
    run_one_index_batch(
        factory, config=embedding_config, embedder=fake, now=now + timedelta(seconds=6)
    )
    db_session.expire_all()
    job = db_session.get(KnowledgeIndexJob, job_id)
    assert job.status == "ready" and job.api_calls == 3 and job.unknown_usage_calls == 1
    assert [len(call) for call in fake.calls] == [16, 2]


def test_three_failed_attempts_stop_until_explicit_retry(db_session, auth_user, embedding_config):
    doc = make_document(db_session, auth_user)
    job_id = queue(db_session, auth_user, doc, embedding_config)
    factory = sessionmaker(bind=db_session.get_bind(), expire_on_commit=False)
    now = utcnow()

    def failed(*_):
        raise EmbeddingError("EMBEDDING_UNAVAILABLE")

    for seconds in (0, 6, 20):
        assert run_one_index_batch(
            factory, config=embedding_config, embedder=failed, now=now + timedelta(seconds=seconds)
        )
    assert not run_one_index_batch(
        factory, config=embedding_config, embedder=failed, now=now + timedelta(hours=1)
    )
    db_session.expire_all()
    job = db_session.get(KnowledgeIndexJob, job_id)
    assert job.status == "failed" and job.attempts == 3 and job.next_retry_at is None
    enqueue_indexes(
        db_session, user_id=auth_user.id, documents=[doc], config=embedding_config, retry=True
    )
    db_session.commit()
    assert run_one_index_batch(factory, config=embedding_config, embedder=ControlledEmbedder())


def test_expired_lease_is_recovered_and_stale_owner_cannot_publish(
    db_session, auth_user, embedding_config
):
    doc = make_document(db_session, auth_user)
    job_id = queue(db_session, auth_user, doc, embedding_config)
    factory = sessionmaker(bind=db_session.get_bind(), expire_on_commit=False)
    job = db_session.get(KnowledgeIndexJob, job_id)
    job.status, job.lease_token, job.lease_until = "running", "old", utcnow() - timedelta(seconds=1)
    db_session.commit()

    def steal(config, texts):
        with factory() as db:
            job = db.get(KnowledgeIndexJob, job_id)
            job.lease_token = "replacement"
            job.lease_until = utcnow() + timedelta(seconds=60)
            db.commit()
        return ControlledEmbedder()(config, texts)

    assert run_one_index_batch(factory, config=embedding_config, embedder=steal)
    db_session.expire_all()
    assert db_session.query(KnowledgeEmbedding).count() == 0
    assert db_session.get(KnowledgeIndexJob, job_id).lease_token == "replacement"


def test_deleted_document_cannot_receive_late_vectors_and_existing_cache_is_removed(
    db_session, auth_user, embedding_config
):
    doc = make_document(db_session, auth_user)
    queue(db_session, auth_user, doc, embedding_config)
    factory = sessionmaker(bind=db_session.get_bind(), expire_on_commit=False)

    def delete(config, texts):
        mark_deleted(db_session, [doc])
        db_session.commit()
        return ControlledEmbedder()(config, texts)

    run_one_index_batch(factory, config=embedding_config, embedder=delete)
    assert db_session.query(KnowledgeEmbedding).count() == 0
    assert db_session.query(KnowledgeIndexJob).count() == 0


def test_private_index_api_is_idempotent_and_version_scoped(
    client, db_session, auth_user, embedding_config
):
    doc = make_document(db_session, auth_user)
    url = f"/api/knowledge/documents/{doc.id}/index"
    assert client.post(url, json={"revision": 1}).json()["status"] == "pending"
    assert client.post(url, json={"revision": 1}).status_code == 200
    assert db_session.query(KnowledgeIndexJob).count() == 1
    assert client.post(url, json={"revision": 2}).status_code == 409
    other = User(username="index-other", email="index-other@example.test", hashed_password="x")
    db_session.add(other)
    db_session.commit()
    private = make_document(db_session, other)
    assert (
        client.post(
            f"/api/knowledge/documents/{private.id}/index", json={"revision": 1}
        ).status_code
        == 404
    )
    listed = client.get("/api/knowledge/documents").json()
    assert listed[0]["index_status"]["status"] == "pending"
    assert all(document["id"] != private.id for document in listed)


def test_deleting_indexed_material_removes_persisted_vectors(
    db_session, auth_user, embedding_config
):
    doc = make_document(db_session, auth_user)
    queue(db_session, auth_user, doc, embedding_config)
    factory = sessionmaker(bind=db_session.get_bind(), expire_on_commit=False)
    run_one_index_batch(factory, config=embedding_config, embedder=ControlledEmbedder())
    assert db_session.query(KnowledgeEmbedding).count() == 2
    mark_deleted(db_session, [doc])
    db_session.commit()
    assert db_session.query(KnowledgeEmbedding).count() == 0
    assert db_session.query(KnowledgeIndexJob).count() == 0
