"""Idempotent indexing requests and one leased, recoverable embedding batch."""

from datetime import timedelta
from uuid import uuid4

from sqlalchemy import and_, or_

from core.database import SessionLocal
from core.errors import ApiError
from models import KnowledgeEmbedding, KnowledgeIndexJob
from schemas.knowledge import MaterialRef
from services.attachments.service import utcnow
from .chunks import read_chunks
from .embedding_client import (
    BATCH_SIZE,
    EmbeddingError,
    configured_embedding,
    content_hash,
    embed_texts,
    split_input,
    unit_vector,
)
from .materials import load_documents

MAX_ATTEMPTS = 3
LEASE_SECONDS = 60


def _available(now):
    return or_(
        KnowledgeIndexJob.status == "pending",
        and_(KnowledgeIndexJob.status == "failed", KnowledgeIndexJob.next_retry_at <= now),
        and_(KnowledgeIndexJob.status == "running", KnowledgeIndexJob.lease_until <= now),
    )


def _claim(session_factory, config, now):
    with session_factory() as db:
        eligible = _available(now)
        db.query(KnowledgeIndexJob).filter(
            eligible,
            KnowledgeIndexJob.attempts >= MAX_ATTEMPTS,
        ).update(
            {
                "status": "failed",
                "next_retry_at": None,
                "lease_token": None,
                "lease_until": None,
                "error_code": "EMBEDDING_ATTEMPTS_EXHAUSTED",
            },
            synchronize_session=False,
        )
        row = (
            db.query(KnowledgeIndexJob)
            .filter(
                eligible,
                KnowledgeIndexJob.config_hash == config.fingerprint,
                KnowledgeIndexJob.attempts < MAX_ATTEMPTS,
            )
            .order_by(KnowledgeIndexJob.updated_at, KnowledgeIndexJob.id)
            .first()
        )
        if row is None:
            db.commit()
            return None
        identity = {
            key: getattr(row, key) for key in ("id", "user_id", "attachment_id", "revision")
        }
        token = str(uuid4())
        changed = (
            db.query(KnowledgeIndexJob)
            .filter(
                KnowledgeIndexJob.id == row.id,
                eligible,
                KnowledgeIndexJob.attempts < MAX_ATTEMPTS,
            )
            .update(
                {
                    "status": "running",
                    "lease_token": token,
                    "lease_until": now + timedelta(seconds=LEASE_SECONDS),
                    "attempts": KnowledgeIndexJob.attempts + 1,
                },
                synchronize_session=False,
            )
        )
        db.commit()
        return {**identity, "token": token} if changed else None


def _owned_job(db, claim, now):
    return db.query(KnowledgeIndexJob).filter(
        KnowledgeIndexJob.id == claim["id"],
        KnowledgeIndexJob.status == "running",
        KnowledgeIndexJob.lease_token == claim["token"],
        KnowledgeIndexJob.lease_until > now,
    )


def _batch(chunks, cached, config):
    selected, texts = [], []
    for chunk in chunks:
        if cached.get(chunk.chunk_id) == content_hash(chunk.text):
            continue
        parts = split_input(chunk.text, config.document_prefix)
        if len(texts) + len(parts) > BATCH_SIZE:
            break
        selected.append((chunk, len(texts), len(parts)))
        texts.extend(parts)
    return selected, texts


def run_one_index_batch(
    session_factory=SessionLocal, *, embedder=embed_texts, config=None, now=None, stop_event=None
):
    config = config or configured_embedding()
    if config is None or stop_event is not None and stop_event.is_set():
        return False
    claim = _claim(session_factory, config, now or utcnow())
    if claim is None:
        return False
    reference = MaterialRef(attachment_id=claim["attachment_id"], revision=claim["revision"])
    try:
        with session_factory() as db:
            documents = load_documents(db, user_id=claim["user_id"], materials=[reference])
            chunks = read_chunks(db, documents)
            cached_rows = (
                db.query(
                    KnowledgeEmbedding.chunk_id,
                    KnowledgeEmbedding.content_hash,
                    KnowledgeEmbedding.dimensions,
                )
                .filter_by(
                    attachment_id=reference.attachment_id,
                    revision=reference.revision,
                    config_hash=config.fingerprint,
                )
                .all()
            )
            cached = {row.chunk_id: row.content_hash for row in cached_rows}
            dimensions = {row.dimensions for row in cached_rows}
            if len(dimensions) > 1:
                raise EmbeddingError("EMBEDDING_RESPONSE_INVALID")
            expected_dimensions = config.dimensions or next(iter(dimensions), None)
            if not chunks:
                raise EmbeddingError("EMBEDDING_NO_TEXT")
            selected, texts = _batch(chunks, cached, config)
        # Both the read and claim transactions are closed before network I/O.
        result = None
        if texts:
            if stop_event is not None and stop_event.is_set():
                raise EmbeddingError("EMBEDDING_STOPPED")
            with session_factory() as db:
                reserved = _owned_job(db, claim, now or utcnow()).update(
                    {
                        "api_calls": KnowledgeIndexJob.api_calls + 1,
                        "unknown_usage_calls": KnowledgeIndexJob.unknown_usage_calls + 1,
                    },
                    synchronize_session=False,
                )
                db.commit()
            if not reserved:
                return True
            result = embedder(config, texts)
        with session_factory() as db:
            load_documents(db, user_id=claim["user_id"], materials=[reference], lock=True)
            job = _owned_job(db, claim, now or utcnow()).with_for_update().first()
            if job is None:
                db.rollback()
                return True
            if stop_event is not None and stop_event.is_set():
                raise EmbeddingError("EMBEDDING_STOPPED")
            # Recheck content identity too; importer bugs must not publish stale vectors.
            current = {
                chunk.chunk_id: content_hash(chunk.text) for chunk in read_chunks(db, documents)
            }
            if current != {chunk.chunk_id: content_hash(chunk.text) for chunk in chunks}:
                raise EmbeddingError("EMBEDDING_SOURCE_CHANGED")
            for chunk, offset, count in selected:
                vectors = result.vectors[offset : offset + count]
                if len(vectors) != count or len({len(v) for v in vectors}) != 1:
                    raise EmbeddingError("EMBEDDING_RESPONSE_INVALID")
                vector = unit_vector(
                    [sum(values) / count for values in zip(*vectors)], expected_dimensions
                )
                expected_dimensions = len(vector)
                db.merge(
                    KnowledgeEmbedding(
                        attachment_id=chunk.attachment_id,
                        revision=chunk.revision,
                        chunk_id=chunk.chunk_id,
                        config_hash=config.fingerprint,
                        content_hash=content_hash(chunk.text),
                        dimensions=len(vector),
                        vector=vector,
                    )
                )
            completed = sum(
                cached.get(chunk.chunk_id) == content_hash(chunk.text) for chunk in chunks
            ) + len(selected)
            job.status = "ready" if completed == len(chunks) else "pending"
            job.total_chunks, job.completed_chunks = len(chunks), completed
            job.attempts = 0
            job.error_code = job.next_retry_at = job.lease_token = job.lease_until = None
            if result:
                job.known_input_tokens += result.input_tokens or 0
                job.unknown_usage_calls -= int(result.input_tokens is not None)
            db.commit()
    except (ApiError, EmbeddingError) as error:
        with session_factory() as db:
            job = _owned_job(db, claim, now or utcnow()).with_for_update().first()
            if job is not None:
                cancelled = isinstance(error, ApiError) or error.code == "EMBEDDING_SOURCE_CHANGED"
                job.status = "cancelled" if cancelled else "failed"
                job.error_code = error.code
                job.next_retry_at = (
                    (now or utcnow()) + timedelta(seconds=5 * 2 ** (job.attempts - 1))
                    if not cancelled and job.attempts < MAX_ATTEMPTS
                    else None
                )
                job.lease_token = job.lease_until = None
                db.commit()
    return True
