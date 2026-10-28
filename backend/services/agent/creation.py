"""Creation request identity and atomic run/command persistence."""

import hashlib
import json

from sqlalchemy.exc import IntegrityError

from core.errors import ApiError
from models import AgentRun, User
from .jobs import enqueue, ensure_capacity


def request_hash(request, *, model_id, topic_id=None):
    payload = {
        "input": request.model_dump(mode="json", exclude={"request_id", "model"}),
        "model": model_id,
        "topic_id": topic_id,
    }
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()


def existing_request(db, *, user_id, request_id, digest, lock=False):
    if not request_id:
        return None
    query = (
        db.query(AgentRun)
        .populate_existing()
        .filter_by(user_id=user_id, create_request_id=request_id)
    )
    run = (query.with_for_update() if lock else query).first()
    if run is not None and run.create_request_hash != digest:
        raise ApiError(
            status_code=409,
            code="IDEMPOTENCY_CONFLICT",
            message="同一请求编号不能用于不同的创建参数",
        )
    return run


def persist_new_run(db, run, *, request_id, digest):
    run.create_request_id, run.create_request_hash = request_id, digest
    user_id = run.user_id
    try:
        db.query(User).filter_by(id=user_id).update({"id": User.id}, synchronize_session=False)
        original = existing_request(
            db, user_id=user_id, request_id=request_id, digest=digest, lock=True
        )
        if original is not None:
            db.commit()
            return original.id
        ensure_capacity(db, user_id)
        db.add(run)
        db.flush()
        enqueue(db, run)
        db.commit()
        return run.id
    except IntegrityError:
        db.rollback()
        original = existing_request(db, user_id=user_id, request_id=request_id, digest=digest)
        if original is None:
            raise
        return original.id
