"""Deliver SSE events without tying generation to the HTTP connection."""

import asyncio
import logging
from collections import deque
from threading import Lock

from core.config import settings
from services.web_search_executor import BoundedExecutor

from .generation import generate
from .types import ChatStreamContext, ChatStreamDependencies

log = logging.getLogger(__name__)
_workers = BoundedExecutor(settings.chat_stream_max_workers, 0)
_BUFFER_LIMIT = 256


class _Delivery:
    def __init__(self):
        self._events: deque[str] = deque()
        self._lock = Lock()
        self._waiter: tuple[asyncio.AbstractEventLoop, asyncio.Event] | None = None
        self._finished = False
        self._detached = False

    def _notify(self):
        if self._waiter is None:
            return
        loop, wake = self._waiter
        try:
            loop.call_soon_threadsafe(wake.set)
        except RuntimeError:
            # The subscriber's event loop has already closed.
            self._detach()

    def _detach(self):
        self._detached = True
        self._events.clear()
        self._waiter = None

    def publish(self, event: str):
        with self._lock:
            if self._detached:
                return
            if len(self._events) == _BUFFER_LIMIT:
                # Close slow subscribers without a terminal event so they recover via polling.
                self._notify()
                self._detach()
                return
            self._events.append(event)
            if len(self._events) == 1:
                self._notify()

    def finish(self):
        with self._lock:
            self._finished = True
            self._notify()

    async def subscribe(self):
        wake = asyncio.Event()
        with self._lock:
            self._waiter = (asyncio.get_running_loop(), wake)
        try:
            while True:
                with self._lock:
                    if self._events:
                        event = self._events.popleft()
                    elif self._finished or self._detached:
                        return
                    else:
                        event = None
                        wake.clear()
                if event is None:
                    await wake.wait()
                else:
                    yield event
        finally:
            with self._lock:
                self._detach()


def start_generation(context: ChatStreamContext, runtime: ChatStreamDependencies):
    delivery = _Delivery()

    def produce():
        try:
            with context.context_session_factory() as db:
                for event in generate(db, context, runtime):
                    delivery.publish(event)
        except Exception:
            log.exception("chat_generation_worker_failed request=%s", context.req.request_id)
        finally:
            delivery.finish()

    _workers.submit(produce)
    return delivery.subscribe()
