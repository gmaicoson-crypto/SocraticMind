"""Canonical, bounded reads of immutable document chunks."""

from sqlalchemy import and_, or_
from core.errors import ApiError
from models import AttachmentChunk
from services.attachments.retrieval import Chunk, MAX_CHUNKS


def read_chunks(db, documents) -> list[Chunk]:
    if not documents:
        return []
    rows = (
        db.query(AttachmentChunk)
        .filter(
            or_(
                *[
                    and_(
                        AttachmentChunk.attachment_id == doc.id,
                        AttachmentChunk.revision == doc.revision,
                    )
                    for doc in documents
                ]
            )
        )
        .order_by(AttachmentChunk.attachment_id, AttachmentChunk.position)
        .limit(MAX_CHUNKS + 1)
        .all()
    )
    if len(rows) > MAX_CHUNKS:
        raise ApiError(status_code=422, code="MATERIAL_LIMIT", message="资料过多，请缩小范围")
    return [
        Chunk(
            row.attachment_id,
            row.revision,
            row.chunk_id,
            row.position,
            row.text,
            row.locator,
            row.title_path,
            row.block_type,
        )
        for row in rows
    ]
