from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    node_key = Column(String, nullable=False)
    role = Column(String, nullable=False)   # ai / user
    content = Column(Text, nullable=False)
    mode = Column(String, default="socratic")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class LearningRecord(Base):
    __tablename__ = "learning_records"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    date = Column(String, nullable=False)  # "2026-04-30"
    created_at = Column(DateTime(timezone=True), server_default=func.now())

