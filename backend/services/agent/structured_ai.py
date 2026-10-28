import json
import logging
from dataclasses import dataclass, field
from time import perf_counter
from typing import Callable, Generic, TypeVar

from pydantic import BaseModel, ValidationError

from ai.util import extract_json_from_markdown
from core.ai_client import get_ai_client, resolve_llm_profile
from core.config import settings
from core.context_budget import completion_options, ensure_fits
from .call_metrics import CallMetrics


log = logging.getLogger(__name__)
SchemaT = TypeVar("SchemaT", bound=BaseModel)


@dataclass(frozen=True)
class RunContext:
    run_id: str
    call_type: str
    model: str | None = None
    observer: Callable[[dict], None] | None = field(default=None, repr=False, compare=False)


@dataclass(frozen=True)
class StructuredResult(Generic[SchemaT]):
    value: SchemaT
    token_usage: int
    latency_ms: int
    attempts: int
    usage_known: bool = True


class StructuredAIError(Exception):
    def __init__(self, code: str, message: str, *, retryable: bool) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable
        self.token_usage = 0
        self.usage_known = False
        self.attempts = 0
        self.latency_ms = 0


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
    if isinstance(error, StructuredAIError):
        return error
    status_code = getattr(error, "status_code", None)
    class_name = type(error).__name__.lower()
    if isinstance(error, TimeoutError) or "timeout" in class_name:
        return StructuredAIError("AI_TIMEOUT", "模型请求超时", retryable=True)
    if status_code == 429:
        return StructuredAIError("AI_RATE_LIMITED", "模型请求受限", retryable=True)
    if isinstance(status_code, int) and status_code >= 500:
        return StructuredAIError("AI_UPSTREAM_ERROR", "模型服务暂时不可用", retryable=True)
    return StructuredAIError("AI_REQUEST_FAILED", "模型请求失败", retryable=False)


def _call(
    client,
    *,
    model: str,
    profile_id: str,
    messages: list[dict],
    temperature: float,
    timeout: float,
    output_tokens: int | None = None,
):
    ensure_fits(messages, profile_id)
    options = completion_options(profile_id, temperature=temperature)
    if output_tokens is not None:
        parameter = "max_completion_tokens" if "max_completion_tokens" in options else "max_tokens"
        options[parameter] = min(
            output_tokens, resolve_llm_profile(profile_id).generation_budget_tokens
        )
    return client.chat.completions.create(
        model=model, messages=messages, **options, timeout=timeout
    )


def _check_finish(response):
    choices = getattr(response, "choices", None) or []
    finish_reason = getattr(choices[0], "finish_reason", None) if choices else None
    if finish_reason == "length":
        raise StructuredAIError(
            "AI_OUTPUT_LIMIT", "模型生成额度不足，结构化结果尚未完成", retryable=False
        )
    if finish_reason == "content_filter":
        raise StructuredAIError("AI_CONTENT_FILTERED", "模型服务中止了本次生成", retryable=False)


def generate_structured(
    schema: type[SchemaT],
    messages: list[dict],
    run_context: RunContext,
    *,
    client=None,
    timeout: float | None = None,
    output_tokens: int | None = None,
    max_repairs: int = 1,
) -> StructuredResult[SchemaT]:
    """All attempts share a deadline; callers may override the configured budget."""
    if timeout is not None and timeout <= 0:
        raise ValueError("timeout 必须大于零")
    if output_tokens is not None and output_tokens <= 0:
        raise ValueError("output_tokens 必须大于零")
    if not 0 <= max_repairs <= 3:
        raise ValueError("max_repairs 必须在 0 到 3 之间")
    profile = resolve_llm_profile(run_context.model)
    ai_client = client or get_ai_client(profile.id)
    started = perf_counter()
    metrics = CallMetrics(run_context.observer)
    base_messages = [
        {
            "role": "system",
            "content": (
                "只返回符合以下 JSON Schema 的 JSON 对象，不要解释或添加额外字段："
                + json.dumps(schema.model_json_schema(), ensure_ascii=False, separators=(",", ":"))
            ),
        },
        *messages,
    ]
    current_messages = base_messages
    budget = settings.structured_ai_timeout_seconds if timeout is None else timeout
    for attempt in range(max_repairs + 1):
        remaining = budget - (perf_counter() - started)
        if remaining <= 0:
            raise metrics.failure(StructuredAIError("AI_TIMEOUT", "模型请求超时", retryable=True))
        response = None
        metrics.start()
        try:
            response = _call(
                ai_client,
                model=profile.model,
                profile_id=profile.id,
                messages=current_messages,
                temperature=0.2 if attempt == 0 else 0,
                timeout=remaining,
                output_tokens=output_tokens,
            )
            _check_finish(response)
        except Exception as error:
            mapped = _map_upstream_error(error)
            metrics.finish(response=response, code=mapped.code)
            log.warning(
                "structured_ai_failed run_id=%s call_type=%s model=%s code=%s",
                run_context.run_id,
                run_context.call_type,
                profile.model,
                mapped.code,
            )
            raise metrics.failure(mapped) from error

        content = _response_content(response)
        try:
            value = _parse(schema, content)
            metrics.finish(response=response)
            break
        except (json.JSONDecodeError, ValidationError, TypeError, ValueError) as error:
            metrics.finish(response=response, code="STRUCTURED_OUTPUT_INVALID")
            if attempt == max_repairs:
                log.warning(
                    "structured_ai_failed run_id=%s call_type=%s model=%s code=%s",
                    run_context.run_id,
                    run_context.call_type,
                    profile.model,
                    "STRUCTURED_OUTPUT_INVALID",
                )
                raise metrics.failure(
                    StructuredAIError(
                        "STRUCTURED_OUTPUT_INVALID", "模型结构化输出校验失败", retryable=True
                    )
                ) from error
            current_messages = [
                *base_messages,
                {"role": "assistant", "content": content},
                {
                    "role": "user",
                    "content": (
                        "修复上一条回复的 JSON 格式和字段，使其严格符合系统消息中的 JSON Schema。"
                        "只返回 JSON，不要解释。"
                    ),
                },
            ]

    latency_ms = round((perf_counter() - started) * 1000)
    usage = metrics.snapshot()
    log.info(
        "structured_ai_complete run_id=%s call_type=%s model=%s tokens=%s latency_ms=%d attempts=%d",
        run_context.run_id,
        run_context.call_type,
        profile.model,
        usage["reported_tokens"] if usage["usage_known"] else None,
        latency_ms,
        attempt + 1,
    )
    return StructuredResult(
        value=value,
        token_usage=usage["reported_tokens"],
        latency_ms=latency_ms,
        attempts=attempt + 1,
        usage_known=usage["usage_known"],
    )
