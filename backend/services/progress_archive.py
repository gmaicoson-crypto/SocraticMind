from models import AgentRun, ArchivedChatActivity, ArchivedMastery, ChatMessage, Node
from sqlalchemy import String, and_, func, or_
from sqlalchemy.orm import Session


def archive_and_delete_messages(
    db: Session,
    *,
    user_id: int,
    ids: list[int] | None = None,
    session_id: str | None = None,
    topic_id: int | None = None,
) -> int:
    """Keep only activity counts for the messages removed in this transaction."""
    if sum(value is not None for value in (ids, session_id, topic_id)) != 1:
        raise ValueError("exactly one message scope is required")
    if ids is not None and not ids:
        return 0

    messages = db.query(ChatMessage).filter(ChatMessage.user_id == user_id)
    if ids is not None:
        messages = messages.filter(ChatMessage.id.in_(ids))
    elif session_id is not None:
        messages = messages.filter(ChatMessage.session_id == session_id)
    else:
        run_sessions = [
            value
            for (value,) in db.query(AgentRun.session_id)
            .filter(AgentRun.user_id == user_id, AgentRun.topic_id == topic_id)
            .distinct()
            .all()
            if value
        ]
        topic_messages = ChatMessage.topic_id == topic_id
        if run_sessions:
            topic_messages = or_(
                topic_messages,
                and_(
                    ChatMessage.topic_id.is_(None),
                    ChatMessage.session_id.in_(run_sessions),
                ),
            )
        messages = messages.filter(topic_messages)

    timestamp = func.cast(ChatMessage.created_at, String(26))
    day = func.substr(timestamp, 1, 10)
    hour = func.substr(timestamp, 12, 2)
    counts = (
        messages.with_entities(day.label("day"), hour.label("hour"), func.count(ChatMessage.id))
        .filter(ChatMessage.role == "user", ChatMessage.mode == "socratic")
        .group_by(day, hour)
        .all()
    )
    db.add_all(
        ArchivedChatActivity(user_id=user_id, day=row.day, hour=int(row.hour), count=row[2])
        for row in counts
    )
    return messages.delete(synchronize_session=False)


def archive_topic_mastery(db: Session, *, user_id: int, topic_id: int, title: str) -> None:
    mastered = (
        db.query(Node.label, Node.mastered_at)
        .filter(Node.topic_id == topic_id, Node.state == "mastered")
        .all()
    )
    db.add_all(
        ArchivedMastery(
            user_id=user_id,
            label=node.label,
            topic_title=title,
            mastered_at=node.mastered_at,
        )
        for node in mastered
    )


def delete_agent_runs(
    db: Session, *, user_id: int, session_id: str | None = None, topic_id: int | None = None
) -> None:
    if (session_id is None) == (topic_id is None):
        raise ValueError("exactly one run scope is required")
    runs = db.query(AgentRun).filter(AgentRun.user_id == user_id)
    if session_id is not None:
        runs = runs.filter(AgentRun.session_id == session_id)
    else:
        runs = runs.filter(AgentRun.topic_id == topic_id)
    for run in runs.all():
        db.delete(run)
