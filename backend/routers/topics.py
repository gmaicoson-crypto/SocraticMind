import json
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload
from pydantic import BaseModel
from typing import List
from core.config import settings
from core.database import get_db
from core.deps import get_current_user
from core.ai_client import get_ai_client
from models.user import User
from models.topic import Topic
from models.node import Node
from models.progress import ChatMessage
from ai.graph_generator import generate_graph, assign_positions
from ai.prompts import RECOMMEND_TOPICS_PROMPT, build_recommend_prompt
from ai.util import extract_json_from_markdown

log = logging.getLogger(__name__)

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


def _topic_to_response(t: Topic, nodes: list[Node]) -> TopicResponse:
    """将 Topic ORM 对象转换为 API 响应格式，同时计算节点总数和已掌握节点数。"""
    return TopicResponse(
        id=t.id,
        title=t.title,
        emoji=t.emoji,
        total_nodes=len(nodes),
        mastered_nodes=sum(1 for n in nodes if n.state == "mastered"),
    )


@router.get("", response_model=List[TopicResponse])
def get_topics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # selectinload 一次性预取所有 topic 的 nodes，避免循环中的 N+1 查询
    topics = (
        db.query(Topic)
        .options(selectinload(Topic.nodes))
        .filter(Topic.user_id == current_user.id)
        .all()
    )
    return [_topic_to_response(t, t.nodes) for t in topics]


@router.post("/generate", response_model=TopicResponse)
def generate_topic(
    req: GenerateTopicRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """调用 AI 为指定主题生成知识图谱节点，自动计算布局坐标后存入数据库。"""
    try:
        graph = generate_graph(req.title)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI 生成失败：{str(e)}")

    raw_nodes = graph.get("nodes", [])
    if not raw_nodes:
        raise HTTPException(status_code=500, detail="AI 未返回有效节点")

    # 根据父子关系计算 SVG 坐标
    raw_nodes = assign_positions(raw_nodes)

    topic = Topic(user_id=current_user.id, title=req.title, emoji=req.emoji)
    db.add(topic)
    db.flush()

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

    return TopicResponse(
        id=topic.id,
        title=topic.title,
        emoji=topic.emoji,
        total_nodes=len(raw_nodes),
        mastered_nodes=0,
    )


@router.delete("/{topic_id}")
def delete_topic(
    topic_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    topic = db.query(Topic).filter(
        Topic.id == topic_id,
        Topic.user_id == current_user.id,
    ).first()
    if not topic:
        raise HTTPException(status_code=404, detail="主题不存在")

    deleted_messages = db.query(ChatMessage).filter(
        ChatMessage.user_id == current_user.id,
        ChatMessage.topic_id == topic.id,
    ).delete(synchronize_session=False)
    db.delete(topic)
    db.commit()
    return {"message": "删除成功", "deleted_messages": deleted_messages}


class UpdateTopicRequest(BaseModel):
    title: str


@router.patch("/{topic_id}")
def update_topic_title(
    topic_id: int,
    req: UpdateTopicRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    topic = db.query(Topic).filter(
        Topic.id == topic_id,
        Topic.user_id == current_user.id,
    ).first()
    if not topic:
        raise HTTPException(status_code=404, detail="主题不存在")
    topic.title = req.title
    db.commit()
    db.refresh(topic)
    return _topic_to_response(topic, list(topic.nodes))


@router.get("/recommend")
def recommend_topics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """根据用户已有主题推荐下一步学习方向；无主题时推荐热门入门主题。

    AI 调用失败时不阻塞首页加载，返回空列表即可，前端做降级处理。
    """
    topics = db.query(Topic).filter(Topic.user_id == current_user.id).all()

    if topics:
        prompt = build_recommend_prompt([t.title for t in topics])
    else:
        prompt = "该用户还没有学习任何主题，请推荐 3 个适合初学者的热门技术学习主题。"

    try:
        response = get_ai_client().chat.completions.create(
            model=settings.deepseek_model,
            messages=[
                {"role": "system", "content": RECOMMEND_TOPICS_PROMPT},
                {"role": "user", "content": prompt},
            ],
            max_tokens=500,
            temperature=0.7,
        )
        return json.loads(extract_json_from_markdown(response.choices[0].message.content))
    except Exception as e:
        log.warning("recommend_topics 调用失败: %s", e)
        return {"recommendations": []}
