"""Hydrate frozen plan references without replaying persisted document text."""

from copy import deepcopy

from core.errors import ApiError
from models import AgentRun
from .retrieval import revalidate_sources


def hydrate_preview(db, *, user_id, preview, topic_id=None):
    result = deepcopy(preview)
    if not result or not result.get("sources"):
        return result
    try:
        result["sources"] = revalidate_sources(
            db,
            user_id=user_id,
            sources=result["sources"],
            topic_id=topic_id,
        )
        result.pop("evidence_unavailable", None)
    except ApiError:
        result["sources"] = [
            {**source, "excerpt": "", "deleted": True} for source in result["sources"]
        ]
        result["evidence_unavailable"] = True
    return result


def plan_previews_for_messages(db, messages):
    requested = {
        (message.metadata_json or {}).get("run_id")
        for message in messages
        if message.message_type == "plan_preview"
    }
    if not requested:
        return {}
    # Restrict both owner and session below; metadata cannot grant access to another run.
    runs = {run.id: run for run in db.query(AgentRun).filter(AgentRun.id.in_(requested)).all()}
    output = {}
    for message in messages:
        if message.message_type != "plan_preview":
            continue
        metadata = message.metadata_json or {}
        run = runs.get(metadata.get("run_id"))
        preview = metadata.get("preview")
        if run is None or run.user_id != message.user_id or run.session_id != message.session_id:
            result = deepcopy(preview)
            if result:
                result["sources"] = [
                    {**source, "excerpt": "", "deleted": True}
                    for source in result.get("sources", [])
                ]
                result["evidence_unavailable"] = True
            output[message.id] = result
            continue
        scope = (
            run.topic_id
            if run.status == "completed"
            else (run.state_json or {}).get("params", {}).get("material_scope_topic_id")
        )
        output[message.id] = hydrate_preview(
            db,
            user_id=message.user_id,
            preview=preview,
            topic_id=scope,
        )
    return output


def assessment_results_for_messages(db, messages):
    requested = {
        (message.metadata_json or {}).get("run_id")
        for message in messages
        if message.message_type == "assessment_result"
    }
    if not requested:
        return {}
    runs = {run.id: run for run in db.query(AgentRun).filter(AgentRun.id.in_(requested)).all()}
    output = {}
    for message in messages:
        if message.message_type != "assessment_result":
            continue
        metadata = message.metadata_json or {}
        run = runs.get(metadata.get("run_id"))
        result = deepcopy(metadata.get("result"))
        if not result:
            continue
        if run is None or run.user_id != message.user_id or run.session_id != message.session_id:
            result["sources"] = [
                {**source, "excerpt": "", "deleted": True} for source in result.get("sources", [])
            ]
            result["evidence_unavailable"] = True
        else:
            result = hydrate_preview(
                db, user_id=message.user_id, topic_id=run.topic_id, preview=result
            )
        output[message.id] = result
    return output
