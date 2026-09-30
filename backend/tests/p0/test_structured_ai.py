import json
import logging
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from core.config import settings
from schemas.structured_ai import (
    AssessmentScore,
    DiagnosticQuestions,
    QuestionScore,
)
from services.agent.structured_ai import (
    RunContext,
    StructuredAIError,
    generate_structured,
    high_risk_notice,
)


@pytest.fixture(autouse=True)
def standard_test_model(monkeypatch):
    monkeypatch.setattr(settings, "llm_models", "")
    monkeypatch.setattr(settings, "llm_default_model_id", "")
    monkeypatch.setattr(settings, "llm_model", "test-model")


def response(content: str, tokens: int = 12):
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=content))],
        usage=SimpleNamespace(total_tokens=tokens),
    )


def questions_payload():
    return {
        "questions": [
            {"question_id": "q1", "dimension": "prior_knowledge", "prompt": "Q1"},
            {"question_id": "q2", "dimension": "application", "prompt": "Q2"},
            {"question_id": "q3", "dimension": "limits", "prompt": "Q3"},
        ]
    }


def client_with(*results):
    calls = []
    queued = iter(results)

    def create(**kwargs):
        calls.append(kwargs)
        result = next(queued)
        if isinstance(result, Exception):
            raise result
        return result

    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    return client, calls


def test_parses_json_and_tracks_tokens():
    client, calls = client_with(response(json.dumps(questions_payload()), tokens=21))

    result = generate_structured(
        DiagnosticQuestions,
        [{"role": "user", "content": "Create questions"}],
        RunContext(run_id="run-1", call_type="diagnostic_questions"),
        client=client,
    )

    assert result.value.questions[0].question_id == "q1"
    assert result.token_usage == 21
    assert result.attempts == 1
    assert calls[0]["temperature"] <= 0.3
    assert calls[0]["timeout"] == 60


@pytest.mark.parametrize(
    "finish_reason,code", [("length", "AI_OUTPUT_LIMIT"), ("content_filter", "AI_CONTENT_FILTERED")]
)
def test_incomplete_finish_never_accepts_even_valid_json(finish_reason, code):
    incomplete = response(json.dumps(questions_payload()))
    incomplete.choices[0].finish_reason = finish_reason
    client, calls = client_with(incomplete)
    with pytest.raises(StructuredAIError) as error:
        generate_structured(
            DiagnosticQuestions,
            [],
            RunContext(run_id="incomplete", call_type="test"),
            client=client,
        )
    assert error.value.code == code
    assert len(calls) == 1


def test_accepts_markdown_json_and_repairs_only_once():
    payload = json.dumps(questions_payload())
    markdown_client, _ = client_with(response(f"```json\n{payload}\n```"))
    assert (
        generate_structured(
            DiagnosticQuestions,
            [],
            RunContext(run_id="run-2", call_type="diagnostic_questions"),
            client=markdown_client,
        ).attempts
        == 1
    )

    repair_client, calls = client_with(response("not json", 5), response(payload, 7))
    result = generate_structured(
        DiagnosticQuestions,
        [],
        RunContext(run_id="run-3", call_type="diagnostic_questions"),
        client=repair_client,
    )
    assert result.attempts == 2
    assert result.token_usage == 12
    assert calls[-1]["temperature"] == 0


def test_invalid_output_after_repair_is_retryable():
    client, _ = client_with(response("bad"), response("still bad"))

    with pytest.raises(StructuredAIError) as error:
        generate_structured(
            DiagnosticQuestions,
            [],
            RunContext(run_id="run-4", call_type="diagnostic_questions"),
            client=client,
        )
    assert error.value.code == "STRUCTURED_OUTPUT_INVALID"
    assert error.value.retryable is True


def test_missing_choices_is_repaired_as_invalid_output():
    client, _ = client_with(
        SimpleNamespace(choices=[], usage=None),
        response(json.dumps(questions_payload())),
    )
    result = generate_structured(
        DiagnosticQuestions,
        [],
        RunContext(run_id="run-empty", call_type="diagnostic_questions"),
        client=client,
    )
    assert result.attempts == 2


@pytest.mark.parametrize(
    ("exception", "code"),
    [
        (TimeoutError("slow"), "AI_TIMEOUT"),
        (type("RateLimit", (Exception,), {"status_code": 429})("limited"), "AI_RATE_LIMITED"),
        (type("Upstream", (Exception,), {"status_code": 503})("down"), "AI_UPSTREAM_ERROR"),
    ],
)
def test_maps_retryable_upstream_errors(exception, code):
    client, _ = client_with(exception)
    with pytest.raises(StructuredAIError) as error:
        generate_structured(
            DiagnosticQuestions,
            [],
            RunContext(run_id="run-error", call_type="diagnostic_questions"),
            client=client,
        )
    assert error.value.code == code
    assert error.value.retryable is True


def test_structured_schemas_enforce_question_count_and_score_total():
    with pytest.raises(ValidationError):
        DiagnosticQuestions.model_validate({"questions": questions_payload()["questions"][:2]})

    scores = [
        QuestionScore(question_id=f"q{i}", score=4, rationale="Evidence") for i in range(1, 4)
    ]
    with pytest.raises(ValidationError):
        AssessmentScore(
            scores=scores,
            total_score=11,
            evaluation_confidence=0.9,
            critical_misconception=False,
            evidence="Strong",
            weaknesses=[],
        )


def test_high_risk_notice_is_deterministic():
    assert high_risk_notice("medical", "First aid")
    assert high_risk_notice("art", "Watercolor") is None


def test_logs_exclude_prompts_answers_and_provider_payloads(caplog):
    secret = "private-answer-never-log"
    client, _ = client_with(response(json.dumps(questions_payload())))
    logger = logging.getLogger("services.agent.structured_ai")
    logger.disabled = False
    with caplog.at_level(logging.INFO, logger=logger.name):
        generate_structured(
            DiagnosticQuestions,
            [{"role": "user", "content": secret}],
            RunContext(run_id="safe-log-run", call_type="diagnostic_questions"),
            client=client,
        )

    assert "safe-log-run" in caplog.text
    assert secret not in caplog.text
    assert "prior_knowledge" not in caplog.text
