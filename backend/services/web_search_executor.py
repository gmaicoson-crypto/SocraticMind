"""Bounded search worker capacity."""

import threading
from concurrent.futures import Future, ThreadPoolExecutor
from time import monotonic
from .web_search_provider import SearchProviderError


class CapacityExceeded(SearchProviderError):
    pass


class BoundedExecutor:
    def __init__(self, workers: int, pending: int):
        self._slots = threading.BoundedSemaphore(workers + pending)
        self._executor = ThreadPoolExecutor(max_workers=workers, thread_name_prefix="web-search")

    def submit(self, function, *args, **kwargs) -> Future:
        if not self._slots.acquire(blocking=False):
            raise CapacityExceeded("联网任务繁忙")
        completed_at = []

        def run():
            try:
                return function(*args, **kwargs)
            finally:
                completed_at.append(monotonic())
                self._slots.release()

        try:
            future = self._executor.submit(run)
            future.web_completed_at = completed_at
        except BaseException:
            self._slots.release()
            raise
        # Future becomes done before its callbacks run. A following search must
        # be able to use the slot as soon as the decision worker has finished.
        future.add_done_callback(lambda done: self._slots.release() if done.cancelled() else None)
        return future

    def shutdown(self):
        self._executor.shutdown(wait=True, cancel_futures=True)
