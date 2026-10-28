"""Real retrieval path with controlled provider vectors; not a model-quality benchmark."""

from dataclasses import replace

import pytest
from sqlalchemy.orm import sessionmaker

from core.config import settings
from core.errors import ApiError
from models import AttachmentChunk, KnowledgeEmbedding, KnowledgeIndexJob
from schemas.knowledge import RetrievalRequest
from services.knowledge import hybrid
from services.knowledge.embedding_client import EmbeddingError
from services.knowledge.index_store import enqueue_indexes
from services.knowledge.indexing import run_one_index_batch
from services.knowledge.materials import replace_topic_materials
from services.knowledge.retrieval import retrieve
from tests.p0.test_knowledge_materials import configure, make_document, make_topic, ref
from tests.p0.test_knowledge_indexing import ControlledEmbedder, embedding_config, queue


def query(db, user, document, text="step size", **changes):
    return retrieve(
        db,
        user_id=user.id,
        materials=[ref(document)],
        model_id="knowledge-test",
        request=RetrievalRequest(query=text),
        **changes,
    )


def indexed(db, user, config):
    document = make_document(db, user)
    queue(db, user, document, config)
    factory = sessionmaker(bind=db.get_bind(), expire_on_commit=False)
    provider = ControlledEmbedder()
    run_one_index_batch(factory, config=config, embedder=provider)
    return document, provider, factory


def test_provider_vectors_retrieve_synonyms_and_repeated_queries_reuse_index(
    db_session, auth_user, embedding_config, monkeypatch
):
    document, provider, factory = indexed(db_session, auth_user, embedding_config)
    monkeypatch.setattr(settings, "knowledge_embedding_enabled", False)
    baseline = query(db_session, auth_user, document)
    assert baseline.status == "no_evidence" and baseline.method == "lexical"
    monkeypatch.setattr(settings, "knowledge_embedding_enabled", True)

    def embed(config, texts):
        assert not db_session.in_transaction()
        return provider(config, texts)

    monkeypatch.setattr(hybrid, "embed_texts", embed)
    for _ in range(2):
        result = query(db_session, auth_user, document)
        assert result.method == "hybrid" and result.index_status == "ready"
        assert [source["chunk_id"] for source in result.sources] == ["c2"]
        assert result.metrics["query_input_tokens"] is not None
    assert provider.calls == [
        ["梯度下降通过梯度方向更新参数。", "学习率决定更新步长。"],
        ["step size"],
        ["step size"],
    ]
    assert not run_one_index_batch(factory, config=embedding_config, embedder=provider)


def test_exact_page_bypasses_semantic_calls_and_missing_page_never_falls_back(
    db_session, auth_user, embedding_config, monkeypatch
):
    document, _, _ = indexed(db_session, auth_user, embedding_config)
    monkeypatch.setattr(
        hybrid, "embed_texts", lambda *_: pytest.fail("Exact location must bypass embeddings")
    )
    result = query(db_session, auth_user, document, "第2页")
    assert result.method == "location" and result.sources[0]["locator"] == {"page": 2}
    assert query(db_session, auth_user, document, "第99页").status == "no_evidence"


def test_low_similarity_is_not_promoted_to_evidence(
    db_session, auth_user, embedding_config, monkeypatch
):
    document, provider, _ = indexed(db_session, auth_user, embedding_config)
    monkeypatch.setattr(hybrid, "embed_texts", provider)
    result = query(db_session, auth_user, document, "量子虫洞")
    assert result.status == "no_evidence" and result.sources == []
    assert result.metrics["dense_candidates"] == 0


def test_service_failure_degrades_visibly_without_reembedding_documents(
    db_session, auth_user, embedding_config, monkeypatch
):
    document, provider, _ = indexed(db_session, auth_user, embedding_config)

    def unavailable(*_):
        raise EmbeddingError("EMBEDDING_UNAVAILABLE")

    monkeypatch.setattr(hybrid, "embed_texts", unavailable)
    result = query(db_session, auth_user, document, "学习率")
    assert result.method == "lexical" and result.sources[0]["chunk_id"] == "c2"
    assert result.index_status == "unavailable"
    assert result.metrics["query_attempted"] and result.metrics["query_input_tokens"] is None
    assert any("EMBEDDING_UNAVAILABLE" in warning for warning in result.warnings)
    assert len(provider.calls) == 1


def test_model_switch_queues_a_new_cache_and_never_mixes_dimensions(
    db_session, auth_user, embedding_config, monkeypatch
):
    document, _, _ = indexed(db_session, auth_user, embedding_config)
    monkeypatch.setattr(settings, "knowledge_embedding_model", "other-model")
    monkeypatch.setattr(
        hybrid, "embed_texts", lambda *_: pytest.fail("New configuration has no index yet")
    )
    result = query(db_session, auth_user, document)
    assert result.method == "lexical" and result.index_status == "pending"
    assert db_session.query(KnowledgeIndexJob).count() == 2


def test_outdated_content_hash_and_dimensions_are_rejected(
    db_session, auth_user, embedding_config, monkeypatch
):
    document, provider, _ = indexed(db_session, auth_user, embedding_config)
    monkeypatch.setattr(hybrid, "embed_texts", provider)
    row = db_session.query(KnowledgeEmbedding).filter_by(chunk_id="c2").one()
    row.vector = [1, 0]
    db_session.commit()
    result = query(db_session, auth_user, document)
    assert result.index_status == "unavailable" and result.sources == []
    row.vector = [0, 1, 0]
    row.content_hash = "outdated"
    db_session.commit()
    assert query(db_session, auth_user, document).sources == []


def test_revocation_during_query_embedding_blocks_all_returned_evidence(
    db_session, auth_user, embedding_config, monkeypatch
):
    document, provider, _ = indexed(db_session, auth_user, embedding_config)
    topic = make_topic(db_session, auth_user)
    replace_topic_materials(
        db_session, user_id=auth_user.id, topic_id=topic.id, materials=[ref(document)]
    )

    def revoke(config, texts):
        replace_topic_materials(db_session, user_id=auth_user.id, topic_id=topic.id, materials=[])
        return provider(config, texts)

    monkeypatch.setattr(hybrid, "embed_texts", revoke)
    with pytest.raises(ApiError, match="主题资料已解除关联"):
        query(db_session, auth_user, document, topic_id=topic.id)


def test_missing_indexes_are_explicit_and_requests_do_not_embed_full_documents(
    db_session, auth_user, embedding_config, monkeypatch
):
    document = make_document(db_session, auth_user)
    monkeypatch.setattr(
        hybrid, "embed_texts", lambda *_: pytest.fail("Missing document index must be queued")
    )
    result = query(db_session, auth_user, document, "学习率")
    assert result.method == "lexical" and result.index_status == "pending"
    assert db_session.query(KnowledgeIndexJob).count() == 1
    assert any("索引尚未就绪" in warning for warning in result.warnings)
