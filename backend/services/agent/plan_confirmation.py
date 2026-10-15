"""Atomically persist a confirmed graph and learning plan."""

from copy import deepcopy
from typing import Any
from sqlalchemy.orm import Session
from core.errors import ApiError
from models import AgentRun, LearnerMemory, Node, StudyPlan, StudyPlanItem, Topic
from models.enums import AgentRunStatus, MemorySource
from .state_machine import transition
from .run_store import _load_owned


def _serialize_node_snapshot(node: Node) -> dict[str, Any]:
    return {
        "id": node.id,
        "key": node.node_key,
        "label": node.label,
        "sub": node.sub or "",
        "state": node.state,
        "x": node.x,
        "y": node.y,
        "parent_keys": [key.strip() for key in (node.parent_keys or "").split(",") if key.strip()],
        "estimated_minutes": node.estimated_minutes,
    }


def confirm_run(
    db: Session,
    *,
    user_id: int,
    run_id: str,
    request_id: str,
) -> AgentRun:
    run = _load_owned(db, user_id, run_id, for_update=True)
    if run.status == AgentRunStatus.COMPLETED.value:
        return run
    if run.status != AgentRunStatus.AWAITING_CONFIRMATION.value:
        db.rollback()
        raise ApiError(
            status_code=409,
            code="AGENT_STATE_CONFLICT",
            message="当前流程不能确认",
            retryable=False,
        )
    state = deepcopy(run.state_json or {})
    preview = state.get("preview")
    if not preview:
        raise ApiError(status_code=409, code="PREVIEW_NOT_READY", message="计划预览尚未生成")

    from datetime import date

    existing_topic_id = state["params"].get("existing_topic_id")
    if existing_topic_id:
        topic = (
            db.query(Topic)
            .filter(Topic.id == existing_topic_id, Topic.user_id == user_id)
            .with_for_update()
            .first()
        )
        if topic is None:
            db.rollback()
            raise ApiError(status_code=404, code="TOPIC_NOT_FOUND", message="主题不存在")
        live_nodes = (
            db.query(Node)
            .filter(Node.topic_id == topic.id)
            .order_by(Node.id)
            .with_for_update()
            .all()
        )
        if [_serialize_node_snapshot(node) for node in live_nodes] != state["node_snapshot"]:
            db.rollback()
            raise ApiError(
                status_code=409,
                code="AGENT_STATE_CONFLICT",
                message="主题节点已变化，请重新生成计划预览",
                retryable=False,
            )
        if db.query(StudyPlan.id).filter(StudyPlan.topic_id == topic.id).first():
            db.rollback()
            raise ApiError(
                status_code=409,
                code="PLAN_ALREADY_EXISTS",
                message="主题已有学习计划",
            )
        nodes_by_key = {node.node_key: node for node in live_nodes}
    else:
        topic = Topic(
            user_id=user_id,
            title=preview["topic"],
            emoji=preview.get("emoji") or "📚",
        )
        db.add(topic)
        db.flush()
        nodes_by_key: dict[str, Node] = {}
        for draft in preview["nodes"]:
            node = Node(
                topic_id=topic.id,
                node_key=draft["key"],
                label=draft["label"],
                sub=draft.get("sub", ""),
                state="available" if not draft.get("parent_keys") else "locked",
                x=draft["x"],
                y=draft["y"],
                parent_keys=",".join(draft.get("parent_keys", [])),
                estimated_minutes=draft["estimated_minutes"],
            )
            db.add(node)
            nodes_by_key[node.node_key] = node
        db.flush()
    plan = StudyPlan(
        user_id=user_id,
        topic_id=topic.id,
        goal=preview["goal"],
        domain=preview["domain"],
        outcome_type=preview["outcome_type"],
        daily_minutes=state["params"]["daily_minutes"],
        timezone=preview["effective_timezone"],
        start_date=date.fromisoformat(preview["start_date"]),
        target_date=(
            date.fromisoformat(preview["target_date"]) if preview.get("target_date") else None
        ),
        estimated_end_date=date.fromisoformat(preview["estimated_end_date"]),
        status="active",
    )
    db.add(plan)
    db.flush()
    for draft in preview["plan_items"]:
        db.add(
            StudyPlanItem(
                plan_id=plan.id,
                node_id=nodes_by_key[draft["node_key"]].id,
                scheduled_date=date.fromisoformat(draft["scheduled_date"]),
                day_order=draft["day_order"],
                estimated_minutes=draft["estimated_minutes"],
                status=draft["status"],
            )
        )

    params = state["params"]
    db.add_all(
        [
            LearnerMemory(
                user_id=user_id,
                topic_id=topic.id,
                kind="goal",
                content=params["goal"],
                source=MemorySource.USER.value,
            ),
            LearnerMemory(
                user_id=user_id,
                topic_id=topic.id,
                kind="background",
                content=f"自报熟悉度：{params['familiarity']}",
                source=MemorySource.USER.value,
            ),
        ]
    )

    diagnostic = state.get("diagnostic_result")
    if diagnostic:
        for kind, values in (
            ("strength", diagnostic.get("strengths", [])),
            ("weakness", diagnostic.get("weaknesses", [])),
        ):
            for content in values:
                db.add(
                    LearnerMemory(
                        user_id=user_id,
                        topic_id=topic.id,
                        kind=kind,
                        content=str(content)[:300],
                        source=MemorySource.DIAGNOSTIC.value,
                    )
                )

    run.status = transition(run.status, AgentRunStatus.COMPLETED).value
    run.topic_id = topic.id
    run.request_id = request_id
    run.result_json = {"topic_id": topic.id, "plan_id": plan.id}
    run.version += 1
    db.commit()
    return _load_owned(db, user_id, run_id)
