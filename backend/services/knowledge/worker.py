"""Bounded lifecycle for durable semantic-index batches."""

import logging
import threading

from core.database import SessionLocal
from .indexing import run_one_index_batch

log = logging.getLogger(__name__)


class KnowledgeIndexWorker:
    def __init__(self, session_factory=SessionLocal):
        self.session_factory = session_factory
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name="knowledge-index", daemon=True)

    def start(self):
        self._thread.start()

    def stop(self):
        self._stop.set()
        # Transport total deadline is at most 15 seconds, including response reading.
        self._thread.join(timeout=17)

    def _run(self):
        while not self._stop.is_set():
            try:
                did_work = run_one_index_batch(self.session_factory, stop_event=self._stop)
            except Exception as error:
                log.warning("knowledge_index_failed error_type=%s", type(error).__name__)
                did_work = False
            self._stop.wait(0.05 if did_work else 2)
