"""One durable command slot per learning workflow."""

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, JSON, String
from sqlalchemy.sql import func

from core.database import Base


class AgentJob(Base):
    __tablename__ = "agent_jobs"

    run_id = Column(String(36), ForeignKey("agent_runs.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(20), nullable=False, default="queued")
    event_json = Column(JSON, nullable=True)
    requested_version = Column(Integer, nullable=False)
    lease_token = Column(String(36), nullable=True)
    lease_until = Column(DateTime(timezone=True), nullable=True)
    attempts = Column(Integer, nullable=False, default=0)
    available_at = Column(DateTime(timezone=True), nullable=True)
    error_code = Column(String(80), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_agent_jobs_available", "status", "available_at", "lease_until"),
        Index("ix_agent_jobs_user_status", "user_id", "status"),
    )
