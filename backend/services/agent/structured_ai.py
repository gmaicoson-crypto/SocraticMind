import json
import logging
from dataclasses import dataclass
from time import perf_counter
from typing import Generic, TypeVar

from pydantic import BaseModel, ValidationError

from ai.util import extract_json_from_markdown
from core.ai_client import get_ai_client, resolve_llm_profile


log = logging.getLogger(__name__)
SchemaT = TypeVar("SchemaT", bound=BaseModel)


@dataclass(frozen=True)
class RunContext:
    run_id: str
    call_type: str
    model: str | None = None


@dataclass(frozen=True)
class StructuredResult(Generic[SchemaT]):
    value: SchemaT
    token_usage: int
    latency_ms: int
    attempts: int


class StructuredAIError(Exception):
    def __init__(self, code: str, message: str, *, retryable: bool) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable


HIGH_RISK_TERMS = {
    "medical",
    "medicine",
    "health",
    "first aid",
    "法律",
    "legal",
    "law",
    "finance",
    "financial",
    "投资",
    "医疗",
    "急救",
    "安全",
    "safety",
}


def high_risk_notice(domain: str, topic: str) -> str | None:
    combined = f"{domain} {topic}".lower()
    if any(term in combined for term in HIGH_RISK_TERMS):
        return "本内容仅用于学习，不替代专业判断、执业认证或现场安全指导。"
    return None


def _token_usage(response) -> int:
    usage = getattr(response, "usage", None)
    return int(getattr(usage, "total_tokens", 0) or 0)


def _response_content(response) -> str:
    choices = getattr(response, "choices", None) or []
    if not choices:
        return ""
    message = getattr(choices[0], "message", None)
    return getattr(message, "content", "") or ""


def _parse(schema: type[SchemaT], content: str) -> SchemaT:
    data = json.loads(extract_json_from_markdown(content))
    return schema.model_validate(data)


def _map_upstream_error(error: Exception) -> StructuredAIError:
    status_code = getattr(error, "status_code", None)
    class_name = type(error).__name__.lower()
    if isinstance(error, TimeoutError) or "timeout" in class_name:
        return StructuredAIError("AI_TIMEOUT", "模型请求超时", retryable=True)
    if status_code == 429:
        return StructuredAIError("AI_RATE_LIMITED", "模型请求受限", retryable=True)
    if isinstance(status_code, int) and status_code >= 500:
        return StructuredAIError("AI_UPSTREAM_ERROR", "模型服务暂时不可用", retryable=True)
    return StructuredAIError("AI_REQUEST_FAILED", "模型请求失败", retryable=False)


def _call(client, *, model: str, messages: list[dict], temperature: float):
    return client.chat.completions.create(
        model=model,
        messages=messages,
        max_tokens=4096,
        temperature=temperature,
        timeout=60,
    )


def generate_structured(
    schema: type[SchemaT],
    messages: list[dict],
    run_context: RunContext,
    *,
    client=None,
) -> StructuredResult[SchemaT]:
    profile = resolve_llm_profile(run_context.model)
    ai_client = client or get_ai_client(profile.id)
    model = profile.model
    started = perf_counter()
    total_tokens = 0
    try:
        first = _call(ai_client, model=model, messages=messages, temperature=0.2)
    except Exception as error:
        mapped = _map_upstream_error(error)
        log.warning(
            "structured_ai_failed run_id=%s call_type=%s model=%s code=%s",
            run_context.run_id,
            run_context.call_type,
            model,
            mapped.code,
        )
        raise mapped from error

    total_tokens += _token_usage(first)
    content = _response_content(first)
    try:
        value = _parse(schema, content)
        attempts = 1
    except (json.JSONDecodeError, ValidationError, TypeError, ValueError):
        repair_messages = [
            *messages,
            {"role": "assistant", "content": content},
            {
                "role": "user",
                "content": (
                    "修复上一条回复的 JSON 格式和字段，使其严格符合以下 JSON Schema。"
                    "只返回 JSON，不要解释："
                    + json.dumps(schema.model_json_schema(), ensure_ascii=False)
                ),
            },
        ]
        try:
            repaired = _call(
                ai_client,
                model=model,
                messages=repair_messages,
                temperature=0,
            )
        except Exception as error:
            mapped = _map_upstream_error(error)
            log.warning(
                "structured_ai_failed run_id=%s call_type=%s model=%s code=%s",
                run_context.run_id,
                run_context.call_type,
                model,
                mapped.code,
            )
            raise mapped from error
        total_tokens += _token_usage(repaired)
        repaired_content = _response_content(repaired)
        try:
            value = _parse(schema, repaired_content)
        except (json.JSONDecodeError, ValidationError, TypeError, ValueError) as error:
            log.warning(
                "structured_ai_failed run_id=%s call_type=%s model=%s code=%s",
                run_context.run_id,
                run_context.call_type,
                model,
                "STRUCTURED_OUTPUT_INVALID",
            )
            raise StructuredAIError(
                "STRUCTURED_OUTPUT_INVALID",
                "模型结构化输出校验失败",
                retryable=True,
            ) from error
        attempts = 2

    latency_ms = round((perf_counter() - started) * 1000)
    log.info(
        "structured_ai_complete run_id=%s call_type=%s model=%s tokens=%d latency_ms=%d attempts=%d",
        run_context.run_id,
        run_context.call_type,
        model,
        total_tokens,
        latency_ms,
        attempts,
    )
    return StructuredResult(
        value=value,
        token_usage=total_tokens,
        latency_ms=latency_ms,
        attempts=attempts,
    )
