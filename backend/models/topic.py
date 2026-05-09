from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base

class Topic(Base):
    __tablename__ = "topics"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(200), nullable=False)
    emoji = Column(String(10), default="📚")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    nodes = relationship("Node", back_populates="topic", cascade="all, delete")
    user = relationship("User", back_populates="topics")