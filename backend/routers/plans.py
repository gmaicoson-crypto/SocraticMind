from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from core.database import get_db
from core.deps import get_current_user
from models import User
from schemas.plan import ReplanRequest
from schemas.review import ReviewAnswerRequest
from services.reviews import review_detail, answer_review
from routers.agent import get_agent_generator, selected_model
from core.user_llm import load_user_profiles
from services.plans import (
    get_today_plan,
    get_topic_plan,
    replan,
    serialize_plan,
)


router = APIRouter(tags=["学习计划"])


@router.get("/api/plans/reviews/{review_id}/attempts")
def read_review_attempts(
    review_id: int,
    after_id: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from services.agent.observability import list_attempts

    return list_attempts(
        db, user_id=current_user.id, review_id=review_id, after_id=after_id, limit=limit
    )


@router.get("/api/plans/reviews/{review_id}")
def read_review(
    review_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return review_detail(db, user_id=current_user.id, review_id=review_id)


@router.post("/api/plans/reviews/{review_id}/answers")
def submit_review(
    review_id: int,
    request: ReviewAnswerRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    generator=Depends(get_agent_generator),
):
    load_user_profiles(db, current_user.id)
    return answer_review(
        db,
        user_id=current_user.id,
        review_id=review_id,
        request=request,
        model_id=selected_model(request.model, current_user.id),
        generator=generator,
    )


@router.get("/api/plans/today")
def read_today_plan(
    timezone: str | None = Query(default=None, max_length=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_today_plan(db, user_id=current_user.id, timezone_name=timezone)


@router.get("/api/topics/{topic_id}/plan")
def read_topic_plan(
    topic_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return serialize_plan(get_topic_plan(db, user_id=current_user.id, topic_id=topic_id))


@router.post("/api/plans/{plan_id}/replan")
def replan_topic(
    plan_id: int,
    request: ReplanRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return serialize_plan(
        replan(
            db,
            user_id=current_user.id,
            plan_id=plan_id,
            request_id=request.request_id,
            timezone_name=request.timezone,
        )
    )
