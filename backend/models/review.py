from sqlalchemy import (
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from core.database import Base


class ReviewTask(Base):
    __tablename__ = "review_tasks"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    node_id = Column(Integer, ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False)
    assessment_id = Column(
        Integer, ForeignKey("assessment_attempts.id", ondelete="SET NULL"), nullable=True
    )
    question_id = Column(String(100), nullable=False)
    question_json = Column(JSON, nullable=False)
    previous_answer = Column(Text, nullable=False)
    feedback = Column(Text, nullable=False)
    due_date = Column(Date, nullable=False)
    timezone = Column(String(100), nullable=False)
    status = Column(String(20), nullable=False, default="pending")
    version = Column(Integer, nullable=False, default=1)
    attempt_count = Column(Integer, nullable=False, default=0)
    processing_token = Column(String(36), nullable=True)
    processing_until = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    node = relationship("Node", back_populates="review_tasks")
    user = relationship("User", back_populates="review_tasks")
    assessment = relationship("AssessmentAttempt", back_populates="review_tasks")
    attempts = relationship("ReviewAttempt", back_populates="review", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("assessment_id", "question_id", name="uq_review_assessment_question"),
        Index("ix_review_user_status_due", "user_id", "status", "due_date"),
    )


class ReviewAttempt(Base):
    __tablename__ = "review_attempts"

    id = Column(Integer, primary_key=True)
    review_id = Column(Integer, ForeignKey("review_tasks.id", ondelete="CASCADE"), nullable=False)
    request_id = Column(String(100), nullable=False)
    version = Column(Integer, nullable=False)
    answer = Column(Text, nullable=False)
    result_json = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    review = relationship("ReviewTask", back_populates="attempts")

    __table_args__ = (
        UniqueConstraint("review_id", "request_id", name="uq_review_attempt_request"),
    )
