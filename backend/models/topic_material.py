"""Explicit topic access to existing immutable document revisions."""

from sqlalchemy import Column, ForeignKey, Index, Integer, String

from core.database import Base


class TopicMaterial(Base):
    __tablename__ = "topic_materials"

    topic_id = Column(Integer, ForeignKey("topics.id", ondelete="CASCADE"), primary_key=True)
    attachment_id = Column(
        String(36), ForeignKey("attachments.id", ondelete="CASCADE"), primary_key=True
    )
    revision = Column(Integer, nullable=False)

    __table_args__ = (Index("ix_topic_materials_attachment_id", "attachment_id"),)
