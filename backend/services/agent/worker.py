"""Supervise one bounded child process at a time; DB leases coordinate replicas."""

import logging
import multiprocessing
import threading
from time import monotonic

from core.database import create_runtime_engine
from sqlalchemy.orm import sessionmaker

from core.config import settings
from .job_execution import job_process
from .jobs import claim_job, finish_job, heartbeat
from .job_recovery import recover_legacy_runs

log = logging.getLogger(__name__)


class AgentWorker:
    def __init__(self, database_url=None, *, target=job_process, job_timeout=600):
        self.database_url = database_url or settings.database_url
        self.target = target
        self.job_timeout = job_timeout
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name="agent-jobs", daemon=True)
        self._context = multiprocessing.get_context("spawn")

    def start(self):
        self._thread.start()

    def stop(self):
        self._stop.set()
        self._thread.join(timeout=8)
        if self._thread.is_alive():
            raise RuntimeError("Agent worker did not stop within its shutdown budget")

    def _execute(self, factory, claim):
        child = self._context.Process(
            target=self.target, args=(self.database_url, claim), name="agent-execution", daemon=True
        )
        began = monotonic()
        renewal = began
        error = None
        child.start()
        try:
            while child.is_alive():
                if self._stop.wait(0.2):
                    break
                now = monotonic()
                if now - began >= self.job_timeout:
                    error = "AGENT_JOB_TIMEOUT"
                    break
                if now >= renewal:
                    if not heartbeat(factory, claim):
                        break
                    renewal = now + 2
        finally:
            if child.is_alive():
                child.terminate()
                child.join(timeout=2)
                if child.is_alive():
                    child.kill()
            child.join(timeout=2)
            if child.exitcode and not error:
                error = "AGENT_EXECUTION_FAILED"
            child.close()
            # Success usually already finished in the child; lost ownership is a no-op.
            finish_job(factory, claim, error_code=error, stopped=self._stop.is_set())

    def _run(self):
        engine = create_runtime_engine(self.database_url, pool_pre_ping=True, hide_parameters=True)
        factory = sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)
        last_recovery = float("-inf")
        try:
            while not self._stop.is_set():
                try:
                    if monotonic() - last_recovery >= 60:
                        recover_legacy_runs(factory)
                        last_recovery = monotonic()
                    claim = claim_job(factory)
                    if claim:
                        self._execute(factory, claim)
                        continue
                except Exception as error:
                    log.warning("agent_worker_failed error_type=%s", type(error).__name__)
                self._stop.wait(1)
        finally:
            engine.dispose()
