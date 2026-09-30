"""Model-specific budgeting shared by conversation and summary requests.

Text tokenization can be exact for a known encoding; Chat Completions framing
remains an estimate. Unknown encodings use UTF-8 bytes, deliberately favouring
early compaction over undercounting. The final guard also reserves safety space.
"""

import json
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Sequence

import tiktoken

from core.ai_client import resolve_llm_profile
from core.config import LLMProfile


@dataclass(frozen=True)
class ContextPolicy:
    context_window_tokens: int
    hard_input_limit: int
    target_input_tokens: int
    summary_trigger_tokens: int
    summary_target_tokens: int
    output_tokens: int
    safety_margin_tokens: int


class ContextWindowExceeded(ValueError):
    def __init__(self, input_tokens: int, input_limit: int):
        self.input_tokens = input_tokens
        self.input_limit = input_limit
        super().__init__(
            f"当前输入及必要上下文约 {input_tokens} token，超过输入上限 {input_limit}；"
            "请缩小引用范围或拆分输入。"
        )


def get_context_policy(model_id: str | None = None) -> ContextPolicy:
    profile = resolve_llm_profile(model_id)
    hard_limit = (
        profile.context_window_tokens
        - profile.generation_budget_tokens
        - profile.safety_margin_tokens
    )
    if profile.max_input_tokens is not None:
        hard_limit = min(hard_limit, profile.max_input_tokens)
    target = min(profile.target_input_tokens, hard_limit)
    trigger = min(profile.summary_trigger_tokens, target)
    summary_target = min(profile.summary_target_tokens, max(1, trigger * 2 // 3))
    return ContextPolicy(
        context_window_tokens=profile.context_window_tokens,
        hard_input_limit=hard_limit,
        target_input_tokens=target,
        summary_trigger_tokens=trigger,
        summary_target_tokens=summary_target,
        output_tokens=profile.generation_budget_tokens,
        safety_margin_tokens=profile.safety_margin_tokens,
    )


@lru_cache(maxsize=32)
def _load_encoding(model: str, encoding_name: str | None):
    if encoding_name == "utf8_bytes":
        return None
    if encoding_name:
        # A misspelled explicit encoding is a configuration error, not a claim
        # that an unrelated tokenizer is suitable for this service.
        return tiktoken.get_encoding(encoding_name)
    try:
        return tiktoken.encoding_for_model(model)
    except KeyError:
        return None


def _profile_encoding(profile: LLMProfile):
    return _load_encoding(profile.model, profile.tokenizer_encoding)


def count_method(model_id: str | None = None) -> str:
    encoding = _profile_encoding(resolve_llm_profile(model_id))
    return (
        f"tiktoken:{encoding.name}+framing_estimate" if encoding else "utf8_bytes+framing_estimate"
    )


def _count_text(text: str, encoding) -> int:
    if encoding is None:
        return len(text.encode("utf-8"))
    # User code may literally contain tokenizer control-token spellings.
    return len(encoding.encode(text, disallowed_special=()))


def count_text(text: str, model_id: str | None = None) -> int:
    return _count_text(text, _profile_encoding(resolve_llm_profile(model_id)))


def count_messages(messages: Sequence[dict[str, Any]], model_id: str | None = None) -> int:
    """Count every message field plus conservative framing overhead.

    This text chat path rejects non-text multimodal parts rather than pretending
    their URL/JSON size accounts for the model's processed image/audio tokens.
    """
    encoding = _profile_encoding(resolve_llm_profile(model_id))
    total = 16  # assistant priming / request framing
    for message in messages:
        total += 12
        for key, value in message.items():
            if key == "content" and isinstance(value, list):
                if any(not isinstance(part, dict) or part.get("type") != "text" for part in value):
                    raise ValueError("当前上下文预算仅支持文本消息，请先提取附件文字")
            if value is None:
                continue
            text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
            total += _count_text(text, encoding)
    return total


def ensure_fits(messages: Sequence[dict[str, Any]], model_id: str | None = None) -> int:
    """Validate the final payload immediately before sending; return its count."""
    policy = get_context_policy(model_id)
    input_tokens = count_messages(messages, model_id)
    if input_tokens > policy.hard_input_limit:
        raise ContextWindowExceeded(input_tokens, policy.hard_input_limit)
    return input_tokens


def uses_reasoning_parameters(model_id: str | None = None) -> bool:
    model = resolve_llm_profile(model_id).model.lower()
    return model.startswith(("o1", "o3", "o4", "gpt-5", "gpt-6"))


def completion_options(
    model_id: str | None = None, *, temperature: float | None = None
) -> dict[str, Any]:
    """Generation limits include reasoning tokens when the service uses them."""
    profile = resolve_llm_profile(model_id)
    parameter = profile.completion_token_parameter
    if parameter == "auto":
        parameter = "max_completion_tokens" if uses_reasoning_parameters(model_id) else "max_tokens"
    options = {parameter: profile.generation_budget_tokens}
    if (
        temperature is not None
        and profile.temperature is not None
        and not uses_reasoning_parameters(model_id)
    ):
        options["temperature"] = temperature
    return options
