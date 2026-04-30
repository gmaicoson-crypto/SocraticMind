from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
from core.database import get_db
from core.deps import get_current_user
from models.user import User
from models.topic import Topic
from models.node import Node
from ai.graph_generator import generate_graph, assign_positions
from ai.prompts import RECOMMEND_TOPICS_PROMPT, build_recommend_prompt

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

class GenerateTopicRequest(BaseModel):
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

@router.post("/generate", response_model=TopicResponse)
def generate_topic(
    req: GenerateTopicRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """AI 自动生成知识图谱"""
    # 调用 AI 生成节点
    try:
        graph = generate_graph(req.title)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI 生成失败：{str(e)}")

    raw_nodes = graph.get("nodes", [])
    if not raw_nodes:
        raise HTTPException(status_code=500, detail="AI 未返回有效节点")

    # 计算坐标
    raw_nodes = assign_positions(raw_nodes)

    # 保存主题
    topic = Topic(
        user_id=current_user.id,
        title=req.title,
        emoji=req.emoji,
    )
    db.add(topic)
    db.flush()

    # 保存节点
    for n in raw_nodes:
        parents = n.get("parent_keys", [])
        state = "available" if not parents else "locked"
        db.add(Node(
            topic_id=topic.id,
            node_key=n["key"],
            label=n["label"],
            sub=n.get("sub", ""),
            x=n.get("x", 300),
            y=n.get("y", 100),
            state=state,
            parent_keys=",".join(parents),
        ))

    db.commit()
    db.refresh(topic)

    total = len(raw_nodes)
    return TopicResponse(
        id=topic.id,
        title=topic.title,
        emoji=topic.emoji,
        total_nodes=total,
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

@router.get("/recommend")
def recommend_topics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    topics = db.query(Topic).filter(Topic.user_id == current_user.id).all()

    if topics:
        prompt = build_recommend_prompt([t.title for t in topics])
    else:
        # 没有主题时让 AI 自由推荐热门学习主题
        prompt = "该用户还没有学习任何主题，请推荐 3 个适合初学者的热门技术学习主题。"

    try:
        from openai import OpenAI
        from core.config import settings
        import json

        client = OpenAI(
            api_key=settings.deepseek_api_key,
            base_url=settings.deepseek_base_url,
        )
        response = client.chat.completions.create(
            model=settings.deepseek_model,
            messages=[
                {"role": "system", "content": RECOMMEND_TOPICS_PROMPT},
                {"role": "user", "content": prompt},
            ],
            max_tokens=500,
            temperature=0.7,
        )
        content = response.choices[0].message.content.strip()
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        content = content.strip()
        return json.loads(content)
    except Exception as e:
        return {"recommendations": []}