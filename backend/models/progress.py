from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Text, Index
from sqlalchemy.sql import func
from core.database import Base

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    node_key = Column(String(100), nullable=False)
    role = Column(String(10), nullable=False)            # ai / user
    content = Column(Text, nullable=False)
    mode = Column(String(50), default="socratic")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # 热力图、本周统计、最活跃时段都按 user_id + created_at 范围过滤
    # role/mode 加单列索引方便 (user_id, role, mode) 三段过滤的等价匹配
    __table_args__ = (
        Index("ix_chat_user_created", "user_id", "created_at"),
        Index("ix_chat_role", "role"),
        Index("ix_chat_mode", "mode"),
    )


class LearningRecord(Base):
    __tablename__ = "learning_records"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    date = Column(String(10), nullable=False)            # "2026-04-30"
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # streak 计算扫描 (user_id, date)；唯一约束顺便防止重复"今日记录"竞态
    __table_args__ = (
        Index("ix_lr_user_date", "user_id", "date", unique=True),
    )

