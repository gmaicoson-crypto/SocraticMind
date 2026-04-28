from sqlalchemy import Column, Integer, String, DateTime, Boolean
from sqlalchemy.sql import func
from core.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    avatar_grad = Column(String, default="linear-gradient(135deg,#e8c87a,#d4974a)")
    bio = Column(String, default="每一个问题都是通往掌握的一步")
    daily_goal = Column(Integer, default=5)
    ai_style = Column(String, default="标准")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    topics = relationship("Topic", back_populates="user", cascade="all, delete")