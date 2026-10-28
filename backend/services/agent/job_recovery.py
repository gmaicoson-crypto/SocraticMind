"""Adopt pre-queue runs left processing by an interrupted older application."""

from copy import deepcopy

from sqlalchemy import or_

from core.errors import ApiError
from models import AgentRun, AgentJob
from .jobs import enqueue, ensure_capacity
from .run_store import _load_owned


def recover_legacy_runs(factory, *, limit=20):
    with factory() as db:
        candidates = (
            db.query(AgentRun.id, AgentRun.user_id)
            .outerjoin(AgentJob, AgentJob.run_id == AgentRun.id)
            .filter(
                AgentJob.run_id.is_(None),
                AgentRun.run_type.in_(["onboarding", "topic_plan"]),
                AgentRun.status.in_(
                    ["collecting", "diagnosing", "drafting", "awaiting_confirmation"]
                ),
                or_(
                    AgentRun.status == "collecting",
                    AgentRun.state_json["processing"].as_boolean().is_(True),
                ),
            )
            .order_by(AgentRun.updated_at, AgentRun.id)
            .limit(limit)
            .all()
        )
    for run_id, user_id in candidates:
        with factory() as db:
            try:
                run = _load_owned(db, user_id, run_id, for_update=True)
                if db.get(AgentJob, run_id) is not None or run.status in {
                    "failed",
                    "completed",
                    "cancelled",
                }:
                    continue
                ensure_capacity(db, user_id, run_id=run_id)
                state = deepcopy(run.state_json or {})
                if run.status == "collecting":
                    params = state.get("params") or {}
                    run.status = "diagnosing" if params.get("use_diagnostic") else "drafting"
                    state["processing_stage"] = (
                        "diagnostic_questions" if params.get("use_diagnostic") else "graph_draft"
                    )
                # A result may have committed before the old process cleared its
                # busy flag. Waiting nodes intentionally perform no business writes.
                state["processing"] = not (
                    run.status == "awaiting_confirmation"
                    or run.status == "diagnosing"
                    and state.get("questions")
                )
                run.state_json = state
                run.version += 1
                enqueue(db, run, event={"kind": "recover"})
                db.commit()
            except ApiError as error:
                db.rollback()
                if error.code not in {"AGENT_QUEUE_FULL", "AGENT_BUSY", "RUN_NOT_FOUND"}:
                    raise
