from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
from core.database import get_db
from core.deps import get_current_user
from models.user import User
from models.topic import Topic
from models.node import Node

router = APIRouter(prefix="/api/topics", tags=["主题"])

class TopicResponse(BaseModel):
    id: int
    title: str
    emoji: str
    total_nodes: int
    mastered_nodes: int

    class Config:
        from_attributes = True

class CreateTopicRequest(BaseModel):
    title: str
    emoji: str = "📚"

@router.get("", response_model=List[TopicResponse])
def get_topics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    topics = db.query(Topic).filter(Topic.user_id == current_user.id).all()
    result = []
    for t in topics:
        nodes = db.query(Node).filter(Node.topic_id == t.id).all()
        result.append(TopicResponse(
            id=t.id,
            title=t.title,
            emoji=t.emoji,
            total_nodes=len(nodes),
            mastered_nodes=len([n for n in nodes if n.state == "mastered"]),
        ))
    return result

@router.post("", response_model=TopicResponse)
def create_topic(
    req: CreateTopicRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    topic = Topic(
        user_id=current_user.id,
        title=req.title,
        emoji=req.emoji,
    )
    db.add(topic)
    db.commit()
    db.refresh(topic)
    return TopicResponse(
        id=topic.id,
        title=topic.title,
        emoji=topic.emoji,
        total_nodes=0,
        mastered_nodes=0,
    )

@router.delete("/{topic_id}")
def delete_topic(
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
    db.delete(topic)
    db.commit()
    return {"message": "删除成功"}