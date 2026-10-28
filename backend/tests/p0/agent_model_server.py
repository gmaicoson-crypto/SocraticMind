"""Local OpenAI-compatible server for full-path acceptance; output quality is controlled."""

import json
import threading
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from core.config import settings
from schemas.structured_ai import (
    DiagnosticQuestions,
    DiagnosticScore,
    PersonalizedGraphDraft,
    AssessmentQuestions,
    AssessmentScore,
)
from tests.p0.test_agent_orchestrator import FakeGenerator
from tests.p0.test_assessment_service import AssessmentGenerator

SCHEMAS = {
    schema.__name__: schema
    for schema in (
        DiagnosticQuestions,
        DiagnosticScore,
        PersonalizedGraphDraft,
        AssessmentQuestions,
        AssessmentScore,
    )
}


def generate(payload):
    messages = payload["messages"]
    schema_text = messages[0]["content"]
    name = json.loads(schema_text[schema_text.index("{") :])["title"]
    if name == "ReviewScore":
        data = next(
            json.loads(item["content"])
            for item in messages
            if item["content"].startswith("{") and '"question"' in item["content"]
        )
        value = dict(
            question_id=data["question"]["question_id"],
            score=4,
            rationale="教材复习通过",
            evaluation_confidence=0.9,
            critical_misconception=False,
        )
    else:
        schema = SCHEMAS[name]
        generator = (
            AssessmentGenerator(score=50) if name.startswith("Assessment") else FakeGenerator()
        )
        value = generator(schema, messages, None).value.model_dump(mode="json")
        if name in {"PersonalizedGraphDraft", "AssessmentQuestions"}:
            for item in value["nodes" if name == "PersonalizedGraphDraft" else "questions"]:
                item["source_ids"] = ["s6"]
            if name == "PersonalizedGraphDraft":
                value["nodes"][0]["label"] = "梯度下降"
    return name, value


@contextmanager
def model_server(monkeypatch):
    calls, errors = [], []

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_POST(self):
            try:
                assert self.path == "/v1/chat/completions"
                payload = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                if payload.get("stream"):
                    calls.append(("teaching", payload["messages"]))
                    chunk = {
                        "id": "local-chat",
                        "object": "chat.completion.chunk",
                        "created": 1,
                        "model": "acceptance",
                        "choices": [
                            {
                                "index": 0,
                                "delta": {"content": "梯度下降沿负梯度更新参数。[[source:s6]]"},
                                "finish_reason": None,
                            }
                        ],
                    }
                    final = {
                        **chunk,
                        "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
                    }
                    body = (
                        "data: "
                        + json.dumps(chunk)
                        + "\n\ndata: "
                        + json.dumps(final)
                        + "\n\ndata: [DONE]\n\n"
                    ).encode()
                    content_type = "text/event-stream"
                else:
                    name, value = generate(payload)
                    calls.append((name, payload["messages"]))
                    body = json.dumps(
                        {
                            "id": "local-completion",
                            "object": "chat.completion",
                            "created": 1,
                            "model": "acceptance",
                            "choices": [
                                {
                                    "index": 0,
                                    "message": {"role": "assistant", "content": json.dumps(value)},
                                    "finish_reason": "stop",
                                }
                            ],
                            "usage": {
                                "total_tokens": 20,
                                "prompt_tokens": 10,
                                "completion_tokens": 10,
                            },
                        }
                    ).encode()
                    content_type = "application/json"
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except Exception as error:
                errors.append(type(error).__name__)
                self.send_error(500, "controlled model server rejected request")

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    profile = json.dumps(
        [
            {
                "id": "acceptance",
                "NAME": "acceptance",
                "MODEL": "acceptance",
                "BASE_URL": f"http://127.0.0.1:{server.server_port}/v1",
                "API_KEY": "isolated-test-key",
                "tokenizer_encoding": "utf8_bytes",
            }
        ]
    )
    monkeypatch.setattr(settings, "llm_models", profile)
    monkeypatch.setattr(settings, "llm_default_model_id", "acceptance")
    monkeypatch.setattr(settings, "knowledge_embedding_enabled", False)
    monkeypatch.setenv("LLM_MODELS", profile)
    monkeypatch.setenv("LLM_DEFAULT_MODEL_ID", "acceptance")
    monkeypatch.setenv("KNOWLEDGE_EMBEDDING_ENABLED", "false")
    thread.start()
    try:
        yield calls
        assert not errors
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
        assert not thread.is_alive()
