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
    created_at = Column(DateTime(timezone=True), server_default=func.now())