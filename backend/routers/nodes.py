from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_
from pydantic import BaseModel
from typing import Any, List
from datetime import timezone
import uuid
from core.database import get_db
from core.deps import get_current_user
from models.user import User
from models.topic import Topic
from models.node import Node
from models.assessment import AssessmentAttempt
from models.agent_run import AgentRun
from models.enums import MasterySource
from core.errors import ApiError
from services.mastery import record_mastery
from services.mastery import revert_mastery
from schemas.mastery import MasteryRequest
from schemas.assessment_history import AssessmentHistoryItem, AssessmentHistoryPage
from services.assessment_results import assessment_result_payload
from services.knowledge.assessment_context import visible_assessment

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
    """跨主题搜索当前用户的节点，按 label 和 sub 模糊匹配（不区分大小写）。"""
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
    estimated_minutes: int
    mastery_source: str | None = None
    mastery_confidence: float | None = None
    assessment_result: dict[str, Any] | None = None

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


def _mastery_response(result):
    return {
        "event_id": result.event_id,
        "node_id": result.node_id,
        "state": result.state,
        "refresh_required": result.refresh_required,
    }


@router.post("/{node_id}/mastery")
def self_report_mastery(
    node_id: int,
    req: MasteryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _mastery_response(
        record_mastery(
            db,
            user_id=current_user.id,
            node_id=node_id,
            source=MasterySource.SELF_REPORTED,
            request_id=req.request_id,
        )
    )


@router.post("/{node_id}/mastery/revert")
def undo_mastery(
    node_id: int,
    req: MasteryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _mastery_response(
        revert_mastery(
            db,
            user_id=current_user.id,
            node_id=node_id,
            request_id=req.request_id,
        )
    )


@router.get("/{node_id}/assessments", response_model=AssessmentHistoryPage)
def get_assessment_history(
    node_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned = (
        db.query(Node.id)
        .join(Topic, Node.topic_id == Topic.id)
        .filter(Node.id == node_id, Topic.user_id == current_user.id)
        .first()
    )
    if owned is None:
        raise ApiError(status_code=404, code="NODE_NOT_FOUND", message="节点不存在")

    # Fetch summary columns only; full questions and answers use the existing run endpoint.
    query = (
        db.query(
            AssessmentAttempt.id,
            AssessmentAttempt.run_id,
            AssessmentAttempt.created_at,
            AssessmentAttempt.completed_at,
            AgentRun.result_json["total_score"].as_integer().label("total_score"),
            AgentRun.result_json["max_score"].as_integer().label("max_score"),
            AgentRun.result_json["passed"].as_boolean().label("passed"),
        )
        .join(AgentRun, AssessmentAttempt.run_id == AgentRun.id)
        .filter(
            AssessmentAttempt.user_id == current_user.id,
            AssessmentAttempt.node_id == node_id,
            AssessmentAttempt.status == "completed",
            AgentRun.user_id == current_user.id,
            AgentRun.run_type == "assessment",
        )
    )
    # Count only IDs so page totals do not load or project the saved scoring JSON.
    total = query.with_entities(func.count(AssessmentAttempt.id)).scalar()
    total_pages = (total + page_size - 1) // page_size
    current_page = min(page, max(total_pages, 1))
    rows = (
        query.order_by(AssessmentAttempt.id.desc())
        .offset((current_page - 1) * page_size)
        .limit(page_size)
        .all()
        if total
        else []
    )
    items = []
    for row in rows:
        assessed_at = row.completed_at or row.created_at
        if assessed_at.tzinfo is None:
            assessed_at = assessed_at.replace(tzinfo=timezone.utc)
        items.append(
            AssessmentHistoryItem(
                id=row.id,
                run_id=row.run_id,
                assessed_at=assessed_at,
                total_score=row.total_score,
                max_score=row.max_score or 12,
                passed=bool(row.passed),
            )
        )
    return AssessmentHistoryPage(
        items=items,
        page=current_page,
        page_size=page_size,
        total=total,
        total_pages=total_pages,
    )


@router.get("/topic/{topic_id}", response_model=List[NodeResponse])
def get_nodes(
    topic_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取指定主题下的所有节点，先校验主题归属确保不越权访问。"""
    topic = (
        db.query(Topic)
        .filter(
            Topic.id == topic_id,
            Topic.user_id == current_user.id,
        )
        .first()
    )
    if not topic:
        raise HTTPException(status_code=404, detail="主题不存在")
    nodes = db.query(Node).filter(Node.topic_id == topic_id).all()
    node_ids = [node.id for node in nodes]
    latest_by_node = {}
    if node_ids:
        latest_ids = (
            db.query(
                AssessmentAttempt.node_id.label("node_id"),
                func.max(AssessmentAttempt.id).label("attempt_id"),
            )
            .filter(
                AssessmentAttempt.user_id == current_user.id,
                AssessmentAttempt.node_id.in_(node_ids),
                AssessmentAttempt.status == "completed",
            )
            .group_by(AssessmentAttempt.node_id)
            .subquery()
        )
        attempts = (
            db.query(AssessmentAttempt)
            .options(joinedload(AssessmentAttempt.run))
            .join(latest_ids, AssessmentAttempt.id == latest_ids.c.attempt_id)
            .all()
        )
        latest_by_node = {attempt.node_id: attempt for attempt in attempts}
    response = []
    for node in nodes:
        latest = latest_by_node.get(node.id)
        response.append(
            NodeResponse(
                id=node.id,
                node_key=node.node_key,
                label=node.label,
                sub=node.sub or "",
                state=node.state,
                x=node.x,
                y=node.y,
                parent_keys=node.parent_keys or "",
                estimated_minutes=node.estimated_minutes,
                mastery_source=node.mastery_source,
                mastery_confidence=node.mastery_confidence,
                assessment_result=(
                    visible_assessment(
                        db,
                        user_id=current_user.id,
                        topic_id=topic_id,
                        result=assessment_result_payload(
                            latest.run.result_json, latest.questions_json, latest.answers_json
                        ),
                    )
                    if latest and latest.run and latest.run.result_json
                    else None
                ),
            )
        )
    return response


@router.post("", response_model=NodeResponse)
def create_node(
    req: CreateNodeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    topic = (
        db.query(Topic)
        .filter(
            Topic.id == req.topic_id,
            Topic.user_id == current_user.id,
        )
        .first()
    )
    if not topic:
        raise HTTPException(status_code=404, detail="主题不存在")

    node = Node(**req.model_dump())
    db.add(node)
    db.commit()
    db.refresh(node)
    return node


@router.put("/{node_id}/master", response_model=NodeResponse, deprecated=True)
def master_node(
    node_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """兼容旧客户端的一键掌握入口，新客户端应使用 /mastery。"""
    try:
        result = record_mastery(
            db,
            user_id=current_user.id,
            node_id=node_id,
            source=MasterySource.SELF_REPORTED,
            request_id=f"legacy-{node_id}-{uuid.uuid4()}",
        )
    except ApiError as error:
        status_code = 400 if error.code == "NODE_LOCKED" else error.status_code
        raise HTTPException(status_code=status_code, detail=error.message) from error
    return db.get(Node, result.node_id)
