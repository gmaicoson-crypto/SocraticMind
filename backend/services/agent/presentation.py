"""Shared response projection for HTTP reads and worker history updates."""

from sqlalchemy.orm import Session
from models import AgentRun
from schemas.agent import AgentRunResponse


def serialize_run(run: AgentRun, *, db: Session | None = None) -> AgentRunResponse:
    from services.assessment_results import assessment_result_payload
    from services.agent.grounding import visible_preview

    from models import AgentJob
    from services.knowledge.assessment_context import visible_assessment

    state = run.state_json or {}
    job = db.get(AgentJob, run.id) if db is not None else None
    processing = run.status not in {"completed", "cancelled", "failed"} and (
        bool(state.get("processing")) or job is not None and job.status in {"queued", "running"}
    )
    step = None
    if not processing and run.status in {"diagnosing", "assessing"} and state.get("step_id"):
        questions = state.get("questions", [])
        index = state.get("current_index", 0)
        if index < len(questions):
            question = questions[index]
            step = {
                "step_id": state["step_id"],
                "prompt": question["prompt"],
                "input_type": question.get("input_type", "text"),
                "choices": question.get("choices", []),
                "current": index + 1,
                "total": len(questions),
            }
    error = None
    if run.error_code:
        error = {"code": run.error_code, "retryable": bool(run.retryable)}
    result = (
        assessment_result_payload(run.result_json, state.get("questions"), state.get("answers"))
        if run.run_type == "assessment"
        else run.result_json
    )
    if db is not None and run.run_type == "assessment":
        result = visible_assessment(db, user_id=run.user_id, topic_id=run.topic_id, result=result)
    return AgentRunResponse(
        run_id=run.id,
        type=run.run_type,
        status=run.status,
        version=run.version,
        processing=processing,
        stage=(
            "queued"
            if job and job.status == "queued"
            else state.get("processing_stage") or "saving"
        )
        if processing
        else None,
        session_id=run.session_id,
        step=step,
        preview=visible_preview(db, run) if db is not None else state.get("preview"),
        result=result,
        error=error,
    )
