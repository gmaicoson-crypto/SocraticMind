from typing import Any

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from core.database import get_db
from core.deps import get_current_user
from models import AgentRun, User
from schemas.agent import (
    AgentAnswerRequest,
    AgentRunResponse,
    ConfirmRunRequest,
    OnboardingRequest,
    RunUpdateRequest,
    TopicPlanRequest,
)
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


router = APIRouter(prefix="/api/agent", tags=["Learning Agent"])


def get_agent_generator():
    return generate_structured


def serialize_run(run: AgentRun) -> AgentRunResponse:
    state = run.state_json or {}
    step = None
    if run.status in {"diagnosing", "assessing"} and state.get("step_id"):
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
    return AgentRunResponse(
        run_id=run.id,
        type=run.run_type,
        status=run.status,
        version=run.version,
        step=step,
        preview=state.get("preview"),
        result=run.result_json,
        error=error,
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
    return serialize_run(
        start_onboarding(
            db,
            user_id=current_user.id,
            request=request,
            generator=generator,
        )
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
    return serialize_run(
        start_topic_plan(
            db,
            user_id=current_user.id,
            topic_id=topic_id,
            request=request,
            generator=generator,
        )
    )


@router.get("/runs/{run_id}", response_model=AgentRunResponse)
def read_run(
    run_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return serialize_run(get_run(db, user_id=current_user.id, run_id=run_id))


@router.post("/runs/{run_id}/answers", response_model=AgentRunResponse)
def answer_run(
    run_id: str,
    request: AgentAnswerRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    generator: Any = Depends(get_agent_generator),
):
    return serialize_run(
        submit_answer(
            db,
            user_id=current_user.id,
            run_id=run_id,
            step_id=request.step_id,
            version=request.version,
            answer=request.answer,
            generator=generator,
        )
    )


@router.patch("/runs/{run_id}", response_model=AgentRunResponse)
def patch_run(
    run_id: str,
    request: RunUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    generator: Any = Depends(get_agent_generator),
):
    return serialize_run(
        update_run_parameters(
            db,
            user_id=current_user.id,
            run_id=run_id,
            updates=request.model_dump(mode="json", exclude_unset=True),
            generator=generator,
        )
    )


@router.post("/runs/{run_id}/confirm", response_model=AgentRunResponse)
def confirm_agent_run(
    run_id: str,
    request: ConfirmRunRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return serialize_run(
        confirm_run(
            db,
            user_id=current_user.id,
            run_id=run_id,
            request_id=request.request_id,
        )
    )


@router.post("/runs/{run_id}/cancel", response_model=AgentRunResponse)
def cancel_agent_run(
    run_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return serialize_run(cancel_run(db, user_id=current_user.id, run_id=run_id))


@router.post("/runs/{run_id}/retry", response_model=AgentRunResponse)
def retry_agent_run(
    run_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    generator: Any = Depends(get_agent_generator),
):
    return serialize_run(
        retry_run(
            db,
            user_id=current_user.id,
            run_id=run_id,
            generator=generator,
        )
    )
