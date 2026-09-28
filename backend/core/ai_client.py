from functools import lru_cache

from openai import OpenAI

from core.config import LLMProfile, settings


def list_llm_profiles() -> list[dict[str, str]]:
    """返回可供前端选择的公开字段，绝不暴露 API key。"""
    return [
        {"id": profile.id, "name": profile.name, "model": profile.model}
        for profile in settings.llm_profiles
    ]


def resolve_llm_profile(model_id: str | None = None) -> LLMProfile:
    """根据前端传入的 profile id 解析配置；空值使用服务端默认配置。"""
    profiles = settings.llm_profiles
    selected_id = model_id or settings.default_llm_profile_id
    for profile in profiles:
        if profile.id == selected_id or profile.model == selected_id:
            return profile
    if selected_id == "default":
        return resolve_llm_profile()
    raise ValueError(f"未知的 LLM 配置: {selected_id}")


@lru_cache(maxsize=16)
def _build_client(profile_id: str, api_key: str, base_url: str) -> OpenAI:
    # 按 profile 复用连接池，避免每次请求重建客户端。
    return OpenAI(api_key=api_key, base_url=base_url, max_retries=0)


def get_ai_client(model_id: str | None = None) -> OpenAI:
    profile = resolve_llm_profile(model_id)
    return _build_client(profile.id, profile.api_key, profile.base_url)


def resolve_model_id(model_id: str | None = None) -> str:
    """校验模型选择并返回规范化 profile id，供请求和 AgentRun 持久化。"""
    return resolve_llm_profile(model_id).id
