from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from pydantic import BaseModel
from typing import List
from datetime import datetime, timezone
from core.database import get_db
from core.deps import get_current_user
from models.user import User
from models.topic import Topic
from models.node import Node

router = APIRouter(prefix="/api/nodes", tags=["节点"])


class SearchedNodeResponse(BaseModel):
    id: int
    node_key: str
    label: str
    sub: str
    state: str
    topic_id: int
    topic_title: str
    topic_emoji: str

    class Config:
        from_attributes = True


@router.get("/search", response_model=List[SearchedNodeResponse])
def search_nodes(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=30),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """跨主题搜索当前用户的节点（按 label / sub 匹配，不区分大小写）。"""
    pattern = f"%{q.strip()}%"
    rows = (
        db.query(Node, Topic)
        .join(Topic, Node.topic_id == Topic.id)
        .filter(Topic.user_id == current_user.id)
        .filter(or_(Node.label.ilike(pattern), Node.sub.ilike(pattern)))
        .limit(limit)
        .all()
    )
    return [
        SearchedNodeResponse(
            id=n.id,
            node_key=n.node_key,
            label=n.label,
            sub=n.sub or "",
            state=n.state,
            topic_id=t.id,
            topic_title=t.title,
            topic_emoji=t.emoji,
        )
        for n, t in rows
    ]

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

    # parent_keys 是逗号分隔字符串，没有规范化的关系表，所以解锁逻辑只能在 Python 里解析；
    # 节点数 < ~1k 时性能可接受，未来如规模上来应迁到 join 表索引化
    all_nodes = db.query(Node).filter(Node.topic_id == node.topic_id).all()
    mastered_keys = {n.node_key for n in all_nodes if n.state == "mastered"}

    for n in all_nodes:
        if n.state == "locked" and n.parent_keys:
            parents = set(n.parent_keys.split(","))
            # 所有父节点都已掌握才解锁；任一未掌握保持 locked
            if parents.issubset(mastered_keys):
                n.state = "available"

    db.commit()
    db.refresh(node)
    return node