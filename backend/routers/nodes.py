from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
from datetime import datetime, timezone
from core.database import get_db
from core.deps import get_current_user
from models.user import User
from models.topic import Topic
from models.node import Node

router = APIRouter(prefix="/api/nodes", tags=["节点"])

class NodeResponse(BaseModel):
    id: int
    node_key: str
    label: str
    sub: str
    state: str
    x: float
    y: float
    parent_keys: str

    class Config:
        from_attributes = True

class CreateNodeRequest(BaseModel):
    topic_id: int
    node_key: str
    label: str
    sub: str = ""
    x: float = 0
    y: float = 0
    parent_keys: str = ""

@router.get("/topic/{topic_id}", response_model=List[NodeResponse])
def get_nodes(
    topic_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    topic = db.query(Topic).filter(
        Topic.id == topic_id,
        Topic.user_id == current_user.id
    ).first()
    if not topic:
        raise HTTPException(status_code=404, detail="主题不存在")
    return db.query(Node).filter(Node.topic_id == topic_id).all()

@router.post("", response_model=NodeResponse)
def create_node(
    req: CreateNodeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    topic = db.query(Topic).filter(
        Topic.id == req.topic_id,
        Topic.user_id == current_user.id
    ).first()
    if not topic:
        raise HTTPException(status_code=404, detail="主题不存在")

    node = Node(**req.model_dump())
    db.add(node)
    db.commit()
    db.refresh(node)
    return node

@router.put("/{node_id}/master", response_model=NodeResponse)
def master_node(
    node_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    node = db.query(Node).join(Topic).filter(
        Node.id == node_id,
        Topic.user_id == current_user.id
    ).first()
    if not node:
        raise HTTPException(status_code=404, detail="节点不存在")
    if node.state == "locked":
        raise HTTPException(status_code=400, detail="节点未解锁")

    node.state = "mastered"
    node.mastered_at = datetime.now(timezone.utc)

    # 解锁子节点
    all_nodes = db.query(Node).filter(Node.topic_id == node.topic_id).all()
    mastered_keys = {n.node_key for n in all_nodes if n.state == "mastered"}

    for n in all_nodes:
        if n.state == "locked" and n.parent_keys:
            parents = set(n.parent_keys.split(","))
            if parents.issubset(mastered_keys):
                n.state = "available"

    db.commit()
    db.refresh(node)
    return node