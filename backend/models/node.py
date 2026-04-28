from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base

class Node(Base):
    __tablename__ = "nodes"

    id = Column(Integer, primary_key=True, index=True)
    topic_id = Column(Integer, ForeignKey("topics.id"), nullable=False)
    node_key = Column(String, nullable=False)   # 前端用的 id，如 "py-basics"
    label = Column(String, nullable=False)
    sub = Column(String, default="")
    state = Column(String, default="locked")    # locked / available / mastered
    x = Column(Float, default=0)
    y = Column(Float, default=0)
    parent_keys = Column(String, default="")    # 逗号分隔的父节点 key
    mastered_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    topic = relationship("Topic", back_populates="nodes")