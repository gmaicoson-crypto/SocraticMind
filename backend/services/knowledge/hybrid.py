"""Scoped lexical/dense rank fusion with explicit, observable degradation."""

import math
from time import monotonic

from sqlalchemy import and_, or_

from core.context_budget import count_text
from models import Attachment, KnowledgeEmbedding
from services.attachments.retrieval import AttachmentRetriever, rank_chunks, requested_location
from .embedding_client import (
    EmbeddingError,
    configured_embedding,
    content_hash,
    embed_texts,
    split_input,
    unit_vector,
)
from .index_store import enqueue_indexes


def identity(chunk):
    return chunk.attachment_id, chunk.revision, chunk.chunk_id


def _dense_ranks(db, *, user_id, chunks, config, vector):
    expected = {identity(chunk): (chunk, content_hash(chunk.text)) for chunk in chunks}
    pairs = {(chunk.attachment_id, chunk.revision) for chunk in chunks}
    if not pairs:
        return [], 0
    rows = (
        db.query(KnowledgeEmbedding)
        .join(Attachment)
        .filter(
            Attachment.user_id == user_id,
            Attachment.status == "ready",
            KnowledgeEmbedding.revision == Attachment.revision,
            KnowledgeEmbedding.config_hash == config.fingerprint,
            or_(
                *[
                    and_(
                        KnowledgeEmbedding.attachment_id == attachment_id,
                        KnowledgeEmbedding.revision == revision,
                    )
                    for attachment_id, revision in pairs
                ]
            ),
        )
        .yield_per(32)
    )
    matches, indexed = [], 0
    deadline = monotonic() + 3
    for row in rows:
        if monotonic() > deadline:
            raise EmbeddingError("EMBEDDING_RETRIEVAL_LIMIT")
        candidate = expected.get((row.attachment_id, row.revision, row.chunk_id))
        if candidate is None or row.content_hash != candidate[1]:
            continue
        normalized = unit_vector(row.vector, len(vector))
        indexed += 1
        similarity = math.fsum(a * b for a, b in zip(normalized, vector))
        if similarity >= config.min_similarity:
            matches.append((similarity, candidate[0]))
    return sorted(matches, key=lambda item: (-item[0], identity(item[1])))[:20], indexed


def _fuse(lexical, dense):
    scores, candidates = {}, {}
    for ranking in (lexical[:20], dense[:20]):
        for index, (_, chunk) in enumerate(ranking, start=1):
            key = identity(chunk)
            candidates[key] = chunk
            scores[key] = scores.get(key, 0) + 1 / (60 + index)
    return [candidates[key] for key in sorted(scores, key=lambda key: (-scores[key], key))]


def select_hybrid(db, *, user_id, documents, chunks, query, model_id, budget):
    lexical = [(score, chunk) for score, chunk in rank_chunks(chunks, query) if score > 0]
    warnings, dense, indexed, query_tokens = [], [], 0, None
    query_attempted = False
    method, index_status = "lexical", "disabled"
    try:
        config = configured_embedding()
        if config is None:
            if not requested_location(query):
                warnings.append("未启用语义检索，本轮使用关键词检索")
        else:
            jobs = enqueue_indexes(db, user_id=user_id, documents=documents, config=config)
            statuses = {job.status for job in jobs}
            index_status = "failed" if "failed" in statuses else "pending"
            has_vectors = (
                db.query(KnowledgeEmbedding.attachment_id)
                .filter(
                    or_(
                        *[
                            and_(
                                KnowledgeEmbedding.attachment_id == doc.id,
                                KnowledgeEmbedding.revision == doc.revision,
                            )
                            for doc in documents
                        ]
                    ),
                    KnowledgeEmbedding.config_hash == config.fingerprint,
                )
                .first()
                is not None
                if documents
                else False
            )
            # Release reads and persist queued work even if the query service fails.
            db.commit()
            if requested_location(query):
                index_status = "ready" if statuses == {"ready"} else index_status
            elif has_vectors and chunks:
                parts = split_input(query, config.query_prefix)
                query_attempted = True
                result = embed_texts(config, parts)
                query_tokens = result.input_tokens
                vector = unit_vector(
                    [sum(values) / len(parts) for values in zip(*result.vectors)], config.dimensions
                )
                dense, indexed = _dense_ranks(
                    db, user_id=user_id, chunks=chunks, config=config, vector=vector
                )
                if indexed:
                    method = "hybrid"
                    index_status = "ready" if indexed == len(chunks) else "partial"
                if indexed != len(chunks):
                    warnings.append("部分语义索引尚未就绪，未索引内容仅参与关键词检索")
            else:
                warnings.append("语义索引尚未就绪，本轮使用关键词检索；可在主题资料中查看或重试")
    except EmbeddingError as error:
        db.rollback()
        method, dense, index_status = "lexical", [], "unavailable"
        warnings.append(f"语义检索暂不可用（{error.code}），本轮使用关键词检索")
    if requested_location(query):
        selected = AttachmentRetriever().select(
            chunks, query, model_id=model_id, token_budget=budget, require_relevance=True
        )
        method = "location"
    else:
        selected, used = [], 0
        for chunk in _fuse(lexical, dense):
            cost = count_text(chunk.text, model_id) + 180
            if used + cost <= budget:
                selected.append(chunk)
                used += cost
            if len(selected) == 12:
                break
    return (
        selected,
        method,
        index_status,
        warnings,
        {
            "query_input_tokens": query_tokens,
            "query_attempted": query_attempted,
            "indexed_chunks": indexed,
            "lexical_candidates": len(lexical),
            "dense_candidates": len(dense),
        },
    )
