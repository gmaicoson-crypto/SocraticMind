# 用户表：存储账号基本信息及个性化设置（头像、每日目标、AI 风格）
from sqlalchemy import Column, Integer, String, DateTime, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    avatar_grad = Column(String(255), default="linear-gradient(135deg,#e8c87a,#d4974a)")
    avatar_url = Column(String(500), nullable=True)
    bio = Column(String(500), default="每一个问题都是通往掌握的一步")
    daily_goal = Column(Integer, default=5)
    ai_style = Column(String(50), default="标准")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    topics = relationship("Topic", back_populates="user", cascade="all, delete")