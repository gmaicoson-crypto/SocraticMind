"""Execute one claimed command; the same path serves workers and inline callers."""

import logging
from core.database import create_runtime_engine
from sqlalchemy.orm import sessionmaker

from core.user_llm import load_user_profiles
from core.errors import ApiError
from .jobs import claim_job, finish_job, guard_claim, fail_claim
from .run_store import _load_owned
from .workflow import execute_workflow


def execute_claim(factory, claim, *, generator=None, raise_errors=False):
    try:
        with factory() as db:
            _load_owned(db, claim["user_id"], claim["run_id"], for_update=True)
            guard_claim(db, claim)
            load_user_profiles(db, claim["user_id"])
            db.commit()
            execute_workflow(
                db,
                user_id=claim["user_id"],
                run_id=claim["run_id"],
                generator=generator,
                event=claim["event"],
                claim=claim,
            )
    except ApiError as error:
        if fail_claim(factory, claim, code=error.code, retryable=bool(error.retryable)):
            sync_history(factory, claim)
        if raise_errors:
            raise
        return
    if finish_job(factory, claim):
        sync_history(factory, claim)


def sync_history(factory, claim):
    from .presentation import serialize_run
    from services.chat_context import sync_agent_run_message

    try:
        with factory() as db:
            run = _load_owned(db, claim["user_id"], claim["run_id"])
            sync_agent_run_message(
                db, run=run, payload=serialize_run(run, db=db).model_dump(mode="json")
            )
    except Exception as error:
        logging.getLogger(__name__).warning(
            "agent_history_sync_failed error_type=%s", type(error).__name__
        )


def dispatch(db, *, user_id, run_id, generator=None, deferred=False):
    if not deferred:
        factory = sessionmaker(bind=db.get_bind(), expire_on_commit=False, autoflush=False)
        db.commit()
        claim = claim_job(factory, run_id=run_id)
        if claim:
            try:
                execute_claim(factory, claim, generator=generator, raise_errors=True)
            except Exception:
                finish_job(factory, claim, error_code="AGENT_EXECUTION_FAILED")
                raise
    return _load_owned(db, user_id, run_id)


def job_process(database_url, claim):
    # A fresh process rebuilds DB pools and user model profiles; no ORM sessions
    # or network clients are shared across fork boundaries.
    engine = create_runtime_engine(database_url, pool_pre_ping=True, hide_parameters=True)
    factory = sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)
    try:
        execute_claim(factory, claim)
    except Exception as error:
        logging.getLogger(__name__).warning(
            "agent_execution_failed error_type=%s", type(error).__name__
        )
        finish_job(factory, claim, error_code="AGENT_EXECUTION_FAILED")
    finally:
        engine.dispose()
