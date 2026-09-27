from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import Session

from models import AgentRun, ChatMessage


def load_recent_chat_history(
    db: Session,
    *,
    user_id: int,
    session_id: str,
    limit: int = 10,
) -> list[dict[str, str]]:
    messages = (
        db.query(ChatMessage)
        .filter(
            ChatMessage.user_id == user_id,
            ChatMessage.session_id == session_id,
            ChatMessage.message_type == "chat",
            or_(
                ChatMessage.metadata_json.is_(None),
                ChatMessage.metadata_json["status"].as_string() == "complete",
            ),
        )
        .order_by(ChatMessage.id.desc())
        .limit(limit)
        .all()
    )
    messages.reverse()
    return [
        {
            "role": "assistant" if message.role == "ai" else "user",
            "content": message.content,
        }
        for message in messages
    ]


def start_chat_messages(
    db: Session,
    *,
    user_id: int,
    topic_id: int | None,
    session_id: str,
    node_key: str,
    user_input: str,
    mode: str,
) -> tuple[ChatMessage, ChatMessage]:
    # node_key is a display/context field for topic overviews and may contain
    # a longer topic title than the legacy column allows.
    persisted_node_key = node_key[:100]
    user_message = ChatMessage(
        user_id=user_id,
        topic_id=topic_id,
        session_id=session_id,
        node_key=persisted_node_key,
        role="user",
        content=user_input,
        mode=mode,
        message_type="chat",
        metadata_json={"status": "complete"},
    )
    ai_message = ChatMessage(
        user_id=user_id,
        topic_id=topic_id,
        session_id=session_id,
        node_key=persisted_node_key,
        role="ai",
        content="",
        mode=mode,
        message_type="chat",
        metadata_json={"status": "streaming"},
    )
    db.add_all([user_message, ai_message])
    db.commit()
    db.refresh(user_message)
    db.refresh(ai_message)
    return user_message, ai_message


def finish_ai_message(
    db: Session,
    *,
    user_id: int,
    message_id: int,
    content: str,
    status: str,
    error_code: str | None = None,
) -> None:
    metadata: dict[str, Any] = {"status": status}
    if error_code:
        metadata["error_code"] = error_code
    message = (
        db.query(ChatMessage)
        .filter(
            ChatMessage.id == message_id,
            ChatMessage.user_id == user_id,
        )
        .one_or_none()
    )
    if message is None:
        return
    message.content = content
    message.metadata_json = metadata
    db.commit()


def sync_agent_run_message(
    db: Session,
    *,
    run: AgentRun,
    payload: dict[str, Any],
    answer: dict[str, Any] | None = None,
) -> None:
    if not run.session_id:
        return

    messages: list[ChatMessage] = []
    node_key = (run.state_json or {}).get("params", {}).get("node_key", "")
    if answer is not None:
        messages.append(
            ChatMessage(
                user_id=run.user_id,
                topic_id=run.topic_id,
                session_id=run.session_id,
                node_key=node_key,
                role="user",
                content=answer["answer"],
                mode="socratic",
                message_type="agent_answer",
                metadata_json={
                    "run_id": run.id,
                    "step_id": answer["step_id"],
                    "submitted_version": answer["version"],
                },
            )
        )

    step = payload.get("step")
    preview = payload.get("preview")
    result = payload.get("result")
    error = payload.get("error")
    if step:
        message_type = "agent_step"
        content = step["prompt"]
        detail = {"step": step}
    elif preview and payload["status"] == "awaiting_confirmation":
        message_type = "plan_preview"
        content = "学习计划预览已生成"
        detail = {"preview": preview}
    elif result and payload["type"] == "assessment":
        message_type = "assessment_result"
        content = "节点评估已完成"
        detail = {"result": result}
    elif result:
        message_type = "agent_result"
        content = "学习计划已创建"
        detail = {"result": result}
    elif payload["status"] in {"failed", "cancelled"}:
        message_type = "agent_status"
        content = "流程执行失败" if payload["status"] == "failed" else "流程已取消"
        detail = {"error": error}
    else:
        message_type = ""
        content = ""
        detail = {}

    if message_type:
        duplicate = (
            db.query(ChatMessage)
            .filter(
                ChatMessage.user_id == run.user_id,
                ChatMessage.session_id == run.session_id,
                ChatMessage.message_type == message_type,
                ChatMessage.metadata_json["run_id"].as_string() == run.id,
                ChatMessage.metadata_json["version"].as_integer() == run.version,
            )
            .first()
            is not None
        )
        if not duplicate:
            messages.append(
                ChatMessage(
                    user_id=run.user_id,
                    topic_id=run.topic_id,
                    session_id=run.session_id,
                    node_key=node_key,
                    role="ai",
                    content=content,
                    mode="socratic",
                    message_type=message_type,
                    metadata_json={
                        "run_id": run.id,
                        "run_type": run.run_type,
                        "status": run.status,
                        "version": run.version,
                        **detail,
                    },
                )
            )

    if messages:
        db.add_all(messages)
        db.commit()
