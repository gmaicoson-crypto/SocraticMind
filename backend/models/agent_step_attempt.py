"""Bounded model-call accounting; never stores prompts, responses or credentials."""

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, JSON, String
from sqlalchemy.sql import func
from core.database import Base


class AgentStepAttempt(Base):
    __tablename__ = "agent_step_attempts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    run_id = Column(String(36), ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=True)
    review_id = Column(Integer, ForeignKey("review_tasks.id", ondelete="CASCADE"), nullable=True)
    input_version = Column(Integer, nullable=False)
    step = Column(String(80), nullable=False)
    model = Column(String(100), nullable=True)
    lease_token = Column(String(36), nullable=True)
    status = Column(String(20), nullable=False, default="running")
    attempts = Column(Integer, nullable=False, default=0)
    reported_tokens = Column(Integer, nullable=False, default=0)
    usage_known = Column(Boolean, nullable=False, default=False)
    latency_ms = Column(Integer, nullable=False, default=0)
    error_code = Column(String(80), nullable=True)
    calls_json = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_agent_step_run", "run_id", "id"),
        Index("ix_agent_step_review", "review_id", "input_version", "id"),
    )
