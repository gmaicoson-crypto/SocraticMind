import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from core.ai_client import resolve_model_id
from core.database import get_db
from core.deps import get_current_user
from core.user_llm import load_user_profiles
from models import AgentRun, User
from schemas.agent import (
    AgentAnswerRequest,
    AgentRunResponse,
    ConfirmRunRequest,
    OnboardingRequest,
    RunUpdateRequest,
    TopicPlanRequest,
)
from schemas.mastery import StartAssessmentRequest
from services.assessments import (
    cancel_assessment,
    retry_assessment,
    start_assessment,
    submit_assessment_answer,
)
from services.chat_context import sync_agent_run_message
from services.agent.orchestrator import (
    cancel_run,
    confirm_run,
    get_run,
    retry_run,
    start_onboarding,
    start_topic_plan,
    submit_answer,
    update_run_parameters,
)
from services.agent.structured_ai import generate_structured
from services.agent.presentation import serialize_run


router = APIRouter(prefix="/api/agent", tags=["Learning Agent"])
log = logging.getLogger(__name__)


def get_agent_generator():
    return generate_structured


@router.get("/runs/{run_id}/attempts")
def read_run_attempts(
    run_id: str,
    after_id: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from services.agent.observability import list_attempts

    return list_attempts(db, user_id=current_user.id, run_id=run_id, after_id=after_id, limit=limit)


def selected_model(model_id: str | None, user_id: int | None = None) -> str:
    try:
        return resolve_model_id(model_id, user_id=user_id)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


def serialize_and_sync(
    db: Session,
    run: AgentRun,
    *,
    answer: dict[str, Any] | None = None,
) -> AgentRunResponse:
    response = serialize_run(run, db=db)
    try:
        sync_agent_run_message(
            db,
            run=run,
            payload=response.model_dump(mode="json"),
            answer=answer,
        )
    except SQLAlchemyError:
        db.rollback()
        log.exception("failed to sync display message for agent run %s", run.id)
    return response


@router.post(
    "/assessments",
    response_model=AgentRunResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_assessment(
    request: StartAssessmentRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    generator: Any = Depends(get_agent_generator),
):
    load_user_profiles(db, current_user.id)
    return serialize_and_sync(
        db,
        start_assessment(
            db,
            user_id=current_user.id,
            node_id=request.node_id,
            request_id=request.request_id,
            session_id=request.session_id,
            generator=generator,
            model_id=selected_model(request.model, current_user.id),
        ),
    )


@router.post(
    "/onboarding",
    response_model=AgentRunResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_onboarding_run(
    request: OnboardingRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    generator: Any = Depends(get_agent_generator),
):
    load_user_profiles(db, current_user.id)
    return serialize_and_sync(
        db,
        start_onboarding(
            db,
            user_id=current_user.id,
            request=request,
            generator=generator,
            deferred=True,
            model_id=selected_model(request.model, current_user.id),
        ),
    )


@router.post(
    "/topics/{topic_id}/plan-runs",
    response_model=AgentRunResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_topic_plan_run(
    topic_id: int,
    request: TopicPlanRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    generator: Any = Depends(get_agent_generator),
):
    load_user_profiles(db, current_user.id)
    return serialize_and_sync(
        db,
        start_topic_plan(
            db,
            user_id=current_user.id,
            topic_id=topic_id,
            request=request,
            generator=generator,
            deferred=True,
            model_id=selected_model(request.model, current_user.id),
        ),
    )


@router.get("/runs/active", response_model=list[AgentRunResponse])
def active_runs(
    session_id: str = Query(min_length=1, max_length=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    runs = (
        db.query(AgentRun)
        .filter(
            AgentRun.user_id == current_user.id,
            AgentRun.session_id == session_id,
            AgentRun.status.notin_(["completed", "cancelled"]),
        )
        .order_by(AgentRun.updated_at.desc(), AgentRun.id.desc())
        .limit(20)
        .all()
    )
    return [serialize_run(run, db=db) for run in runs]


@router.get("/runs/{run_id}", response_model=AgentRunResponse)
def read_run(
    run_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return serialize_run(get_run(db, user_id=current_user.id, run_id=run_id), db=db)


@router.post("/runs/{run_id}/answers", response_model=AgentRunResponse)
def answer_run(
    run_id: str,
    request: AgentAnswerRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    generator: Any = Depends(get_agent_generator),
):
    load_user_profiles(db, current_user.id)
    run = get_run(db, user_id=current_user.id, run_id=run_id)
    submit = submit_assessment_answer if run.run_type == "assessment" else submit_answer
    completed = submit(
        db,
        user_id=current_user.id,
        run_id=run_id,
        step_id=request.step_id,
        version=request.version,
        answer=request.answer,
        generator=generator,
        **({"deferred": True} if run.run_type != "assessment" else {}),
    )
    return serialize_and_sync(
        db,
        completed,
        answer={
            "step_id": request.step_id,
            "version": request.version,
            "answer": request.answer,
        },
    )


@router.patch("/runs/{run_id}", response_model=AgentRunResponse)
def patch_run(
    run_id: str,
    request: RunUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    generator: Any = Depends(get_agent_generator),
):
    load_user_profiles(db, current_user.id)
    return serialize_and_sync(
        db,
        update_run_parameters(
            db,
            user_id=current_user.id,
            run_id=run_id,
            updates=request.model_dump(mode="json", exclude_unset=True),
            generator=generator,
            deferred=True,
        ),
    )


@router.post("/runs/{run_id}/confirm", response_model=AgentRunResponse)
def confirm_agent_run(
    run_id: str,
    request: ConfirmRunRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return serialize_and_sync(
        db,
        confirm_run(
            db,
            user_id=current_user.id,
            run_id=run_id,
            request_id=request.request_id,
            version=request.version,
            deferred=True,
        ),
    )


@router.post("/runs/{run_id}/cancel", response_model=AgentRunResponse)
def cancel_agent_run(
    run_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    load_user_profiles(db, current_user.id)
    run = get_run(db, user_id=current_user.id, run_id=run_id)
    cancel = cancel_assessment if run.run_type == "assessment" else cancel_run
    return serialize_and_sync(db, cancel(db, user_id=current_user.id, run_id=run_id))


@router.post("/runs/{run_id}/retry", response_model=AgentRunResponse)
def retry_agent_run(
    run_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    generator: Any = Depends(get_agent_generator),
):
    load_user_profiles(db, current_user.id)
    run = get_run(db, user_id=current_user.id, run_id=run_id)
    retry = retry_assessment if run.run_type == "assessment" else retry_run
    return serialize_and_sync(
        db,
        retry(
            db,
            user_id=current_user.id,
            run_id=run_id,
            generator=generator,
            **({"deferred": True} if run.run_type != "assessment" else {}),
        ),
    )
