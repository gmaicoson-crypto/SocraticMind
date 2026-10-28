"""Versioned document vectors and durable batch work, in the application database."""

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, JSON, String
from sqlalchemy.sql import func

from core.database import Base


class KnowledgeEmbedding(Base):
    __tablename__ = "knowledge_embeddings"
    attachment_id = Column(
        String(36), ForeignKey("attachments.id", ondelete="CASCADE"), primary_key=True
    )
    revision = Column(Integer, primary_key=True)
    config_hash = Column(String(64), primary_key=True)
    chunk_id = Column(String(64), primary_key=True)
    content_hash = Column(String(64), nullable=False)
    dimensions = Column(Integer, nullable=False)
    vector = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class KnowledgeIndexJob(Base):
    __tablename__ = "knowledge_index_jobs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    attachment_id = Column(
        String(36), ForeignKey("attachments.id", ondelete="CASCADE"), nullable=False
    )
    revision = Column(Integer, nullable=False)
    config_hash = Column(String(64), nullable=False)
    status = Column(String(20), nullable=False, default="pending")
    lease_token = Column(String(36), nullable=True)
    lease_until = Column(DateTime(timezone=True), nullable=True)
    attempts = Column(Integer, nullable=False, default=0)
    next_retry_at = Column(DateTime(timezone=True), nullable=True)
    completed_chunks = Column(Integer, nullable=False, default=0)
    total_chunks = Column(Integer, nullable=False, default=0)
    api_calls = Column(Integer, nullable=False, default=0)
    known_input_tokens = Column(Integer, nullable=False, default=0)
    unknown_usage_calls = Column(Integer, nullable=False, default=0)
    error_code = Column(String(80), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    __table_args__ = (
        Index(
            "uq_knowledge_index_version", "attachment_id", "revision", "config_hash", unique=True
        ),
        Index("ix_knowledge_index_work", "config_hash", "status", "next_retry_at"),
    )
