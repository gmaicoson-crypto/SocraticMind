"""Content-free accounting for every physical structured-generation attempt."""

from copy import deepcopy
from time import perf_counter


class CallMetrics:
    def __init__(self, observer=None):
        self.started = perf_counter()
        self.observer = observer
        self.calls = []

    def start(self):
        self.call_started = perf_counter()
        self.calls.append(
            {"status": "running", "tokens": None, "latency_ms": 0, "error_code": None}
        )
        self.publish()

    def finish(self, *, response=None, code=None):
        tokens = getattr(getattr(response, "usage", None), "total_tokens", None)
        if not isinstance(tokens, int) or isinstance(tokens, bool) or tokens < 0:
            tokens = None
        self.calls[-1] = {
            "status": "failed" if code else "succeeded",
            "tokens": tokens,
            "latency_ms": round((perf_counter() - self.call_started) * 1000),
            "error_code": code,
        }
        self.publish()

    def snapshot(self):
        return {
            "attempts": len(self.calls),
            "reported_tokens": sum(call["tokens"] or 0 for call in self.calls),
            "usage_known": bool(self.calls)
            and all(call["tokens"] is not None for call in self.calls),
            "latency_ms": round((perf_counter() - self.started) * 1000),
            "calls_json": deepcopy(self.calls),
        }

    def publish(self):
        if self.observer is not None:
            self.observer(self.snapshot())

    def failure(self, error):
        values = self.snapshot()
        error.token_usage = values["reported_tokens"]
        error.usage_known = values["usage_known"]
        error.attempts = values["attempts"]
        error.latency_ms = values["latency_ms"]
        return error
