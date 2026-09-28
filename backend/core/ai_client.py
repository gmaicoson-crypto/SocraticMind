from openai import OpenAI
from core.config import settings

_client: OpenAI | None = None


def get_ai_client() -> OpenAI:
    """惰性单例：避免每次请求重建客户端，复用底层 HTTP 连接池，降低连接开销。

    使用 OpenAI 兼容接口，服务地址和模型由环境配置提供。
    """
    global _client
    if _client is None:
        _client = OpenAI(
            api_key=settings.llm_api_key,
            base_url=settings.llm_base_url,
            max_retries=0,
        )
    return _client
