"""Own material selection, topic bindings and immutable revision validation."""

from datetime import timedelta

from sqlalchemy import or_
from sqlalchemy.orm import Session

from core.errors import ApiError
from models import Attachment, Topic, TopicMaterial
from schemas.knowledge import MaterialRef
from services.attachments.config import DRAFT_HOURS
from services.attachments.service import expired, summary, utcnow


def owned_topic(db: Session, user_id: int, topic_id: int, *, lock=False) -> Topic:
    query = db.query(Topic).filter_by(id=topic_id, user_id=user_id)
    if lock:
        query = query.with_for_update()
    topic = query.first()
    if topic is None:
        raise ApiError(status_code=404, code="TOPIC_NOT_FOUND", message="主题不存在")
    return topic


def available(row: Attachment, revision: int) -> bool:
    return (
        row.kind == "document"
        and row.status == "ready"
        and row.revision == revision
        and not expired(row.expires_at)
    )


def load_documents(
    db: Session, *, user_id: int, materials: list[MaterialRef], lock=False
) -> list[Attachment]:
    if not materials:
        return []
    if len(materials) > 20 or len({ref.attachment_id for ref in materials}) != len(materials):
        raise ApiError(status_code=422, code="MATERIAL_LIMIT", message="最多选择 20 份不同资料")
    query = (
        db.query(Attachment)
        .populate_existing()
        .filter(
            Attachment.user_id == user_id,
            Attachment.id.in_([ref.attachment_id for ref in materials]),
        )
    )
    if lock:
        query = query.order_by(Attachment.id).with_for_update()
    rows = {row.id: row for row in query.all()}
    for ref in materials:
        row = rows.get(ref.attachment_id)
        if row is None or row.status == "deleted" or expired(row.expires_at):
            raise ApiError(status_code=404, code="MATERIAL_NOT_FOUND", message="资料不存在或已失效")
        if not available(row, ref.revision):
            raise ApiError(
                status_code=409,
                code="MATERIAL_REVISION_CONFLICT",
                message="资料尚未就绪或版本已变化，请重新选择",
                retryable=False,
            )
    return [rows[ref.attachment_id] for ref in materials]


def list_documents(db: Session, *, user_id: int, after: str | None, limit: int):
    query = db.query(Attachment).filter(
        Attachment.user_id == user_id,
        Attachment.kind == "document",
        Attachment.status == "ready",
        or_(Attachment.expires_at.is_(None), Attachment.expires_at > utcnow()),
    )
    if after:
        query = query.filter(Attachment.id > after)
    from .index_store import index_statuses

    rows = query.order_by(Attachment.id).limit(limit).all()
    statuses = index_statuses(db, user_id=user_id, documents=rows)
    return [{**summary(row), "index_status": statuses[row.id]} for row in rows]


def topic_refs(db: Session, *, user_id: int, topic_id: int, lock=False) -> list[MaterialRef]:
    owned_topic(db, user_id, topic_id, lock=lock)
    rows = (
        db.query(TopicMaterial)
        .filter_by(topic_id=topic_id)
        .order_by(TopicMaterial.attachment_id)
        .limit(21)
        .all()
    )
    if len(rows) > 20:
        raise ApiError(
            status_code=422, code="MATERIAL_LIMIT", message="主题资料超过上限，请重新选择"
        )
    return [MaterialRef(attachment_id=row.attachment_id, revision=row.revision) for row in rows]


def list_topic_materials(db: Session, *, user_id: int, topic_id: int):
    from .index_store import index_statuses

    refs = topic_refs(db, user_id=user_id, topic_id=topic_id)
    rows = {
        row.id: row
        for row in db.query(Attachment)
        .filter(
            Attachment.user_id == user_id, Attachment.id.in_([ref.attachment_id for ref in refs])
        )
        .all()
    }
    statuses = index_statuses(db, user_id=user_id, documents=list(rows.values()))
    return [
        {
            "document": {
                **summary(rows[ref.attachment_id]),
                "index_status": statuses[ref.attachment_id],
            },
            "revision": ref.revision,
            "available": available(rows[ref.attachment_id], ref.revision),
        }
        for ref in refs
        if ref.attachment_id in rows
    ]


def replace_topic_materials(
    db: Session, *, user_id: int, topic_id: int, materials: list[MaterialRef], commit=True
):
    owned_topic(db, user_id, topic_id, lock=True)
    rows = load_documents(db, user_id=user_id, materials=materials, lock=True)
    previous = {row.attachment_id for row in db.query(TopicMaterial).filter_by(topic_id=topic_id)}
    db.query(TopicMaterial).filter_by(topic_id=topic_id).delete(synchronize_session=False)
    for row in rows:
        db.add(TopicMaterial(topic_id=topic_id, attachment_id=row.id, revision=row.revision))
        # Explicit topic selection gives draft uploads a durable lifecycle.
        row.expires_at = None
    db.flush()
    # No network request here; embedding work is owned by the durable worker.
    from .embedding_client import EmbeddingError
    from .index_store import enqueue_indexes

    try:
        enqueue_indexes(db, user_id=user_id, documents=rows)
    except EmbeddingError:
        pass  # Invalid optional embedding configuration must not block lexical learning.
    removed = previous - {row.id for row in rows}
    for row in (
        db.query(Attachment)
        .filter(
            Attachment.user_id == user_id,
            Attachment.id.in_(removed),
            Attachment.session_id.is_(None),
        )
        .all()
    ):
        if not db.query(TopicMaterial).filter_by(attachment_id=row.id).first():
            row.expires_at = utcnow() + timedelta(hours=DRAFT_HOURS)
    if commit:
        db.commit()
    return list_topic_materials(db, user_id=user_id, topic_id=topic_id)
