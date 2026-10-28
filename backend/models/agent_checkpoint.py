"""Durable LangGraph checkpoints bound to the owning business run."""

from sqlalchemy import Column, ForeignKey, Integer, JSON, LargeBinary, String
from sqlalchemy.dialects.mysql import MEDIUMBLOB

from core.database import Base


def checkpoint_blob():
    return LargeBinary().with_variant(MEDIUMBLOB(), "mysql")


class AgentCheckpoint(Base):
    __tablename__ = "agent_checkpoints"

    run_id = Column(String(36), ForeignKey("agent_runs.id", ondelete="CASCADE"), primary_key=True)
    namespace = Column(String(96), primary_key=True, default="")
    checkpoint_id = Column(String(64), primary_key=True)
    parent_id = Column(String(64), nullable=True)
    value_type = Column(String(16), nullable=False)
    payload = Column(checkpoint_blob(), nullable=False)
    metadata_json = Column(JSON, nullable=False)


class AgentCheckpointWrite(Base):
    __tablename__ = "agent_checkpoint_writes"

    run_id = Column(String(36), ForeignKey("agent_runs.id", ondelete="CASCADE"), primary_key=True)
    namespace = Column(String(96), primary_key=True, default="")
    checkpoint_id = Column(String(64), primary_key=True)
    task_id = Column(String(64), primary_key=True)
    write_index = Column(Integer, primary_key=True)
    channel = Column(String(128), nullable=False)
    value_type = Column(String(16), nullable=False)
    payload = Column(checkpoint_blob(), nullable=False)
