"""Idempotent index requests and public progress, without embedding calls."""

from sqlalchemy.exc import IntegrityError
from models import KnowledgeIndexJob
from .embedding_client import EmbeddingError, configured_embedding


def enqueue_indexes(db, *, user_id, documents, config=None, retry=False):
    config = config or configured_embedding()
    if config is None:
        return []
    result = []
    for document in documents:
        identity = dict(
            attachment_id=document.id, revision=document.revision, config_hash=config.fingerprint
        )
        row = db.query(KnowledgeIndexJob).filter_by(**identity, user_id=user_id).first()
        if row is None:
            try:
                with db.begin_nested():
                    row = KnowledgeIndexJob(user_id=user_id, **identity)
                    db.add(row)
                    db.flush()
            except IntegrityError:
                row = db.query(KnowledgeIndexJob).filter_by(**identity, user_id=user_id).one()
        elif retry and row.status in {"failed", "cancelled", "ready"}:
            db.query(KnowledgeIndexJob).filter(
                KnowledgeIndexJob.id == row.id,
                KnowledgeIndexJob.status.in_(["failed", "cancelled", "ready"]),
            ).update(
                {
                    "status": "pending",
                    "attempts": 0,
                    "next_retry_at": None,
                    "error_code": None,
                    "lease_token": None,
                    "lease_until": None,
                },
                synchronize_session=False,
            )
            db.refresh(row)
        result.append(row)
    return result


def public_index_status(db, *, user_id, document, config=None):
    return index_statuses(db, user_id=user_id, documents=[document], config=config)[document.id]


def index_statuses(db, *, user_id, documents, config=None):
    try:
        config = config or configured_embedding()
    except EmbeddingError:
        return {
            doc.id: {"status": "unavailable", "error_code": "EMBEDDING_CONFIG_INVALID"}
            for doc in documents
        }
    if config is None:
        return {
            doc.id: {"status": "disabled", "completed_chunks": 0, "total_chunks": 0}
            for doc in documents
        }
    rows = {
        (row.attachment_id, row.revision): row
        for row in db.query(KnowledgeIndexJob).filter(
            KnowledgeIndexJob.user_id == user_id,
            KnowledgeIndexJob.attachment_id.in_([doc.id for doc in documents]),
            KnowledgeIndexJob.config_hash == config.fingerprint,
        )
    }
    result = {}
    for document in documents:
        row = rows.get((document.id, document.revision))
        result[document.id] = (
            {
                key: getattr(row, key)
                for key in (
                    "status",
                    "completed_chunks",
                    "total_chunks",
                    "error_code",
                    "api_calls",
                    "known_input_tokens",
                    "unknown_usage_calls",
                )
            }
            if row
            else {"status": "not_indexed", "completed_chunks": 0, "total_chunks": 0}
        )
    return result
