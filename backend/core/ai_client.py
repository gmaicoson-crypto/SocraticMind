from openai import OpenAI
from core.config import settings

_client: OpenAI | None = None


def get_ai_client() -> OpenAI:
    """惰性单例：避免每次请求重建客户端，复用底层 HTTP 连接池，降低连接开销。

    DeepSeek 兼容 OpenAI SDK，通过 base_url 切换到 DeepSeek 的接口地址。
    """
    global _client
    if _client is None:
        _client = OpenAI(
            api_key=settings.deepseek_api_key,
            base_url=settings.deepseek_base_url,
        )
    return _client
