from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base

class Node(Base):
    __tablename__ = "nodes"

    id = Column(Integer, primary_key=True, index=True)
    # 加索引：search、joinedload 都按 topic_id 过滤
    topic_id = Column(Integer, ForeignKey("topics.id"), nullable=False, index=True)
    node_key = Column(String, nullable=False)   # 前端用的 id，如 "py-basics"
    label = Column(String, nullable=False)
    sub = Column(String, default="")
    # state 是搜索结果与统计的高频过滤列
    state = Column(String, default="locked", index=True)  # locked / available / mastered
    x = Column(Float, default=0)
    y = Column(Float, default=0)
    parent_keys = Column(String, default="")    # 逗号分隔的父节点 key
    mastered_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    topic = relationship("Topic", back_populates="nodes")

    # 复合索引覆盖 "本主题下按状态过滤"（统计与解锁逻辑都会用到）
    __table_args__ = (
        Index("ix_nodes_topic_state", "topic_id", "state"),
    )