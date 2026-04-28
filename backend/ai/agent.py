from openai import OpenAI
from core.config import settings
from .prompts import SOCRATIC_SYSTEM_PROMPT, build_user_message
from typing import Generator

client = OpenAI(
    api_key=settings.deepseek_api_key,
    base_url=settings.deepseek_base_url,
)

def chat_stream(
    messages: list,
    node_label: str,
    node_sub: str,
    user_input: str,
) -> Generator[str, None, None]:
    """流式调用 DeepSeek，返回 SSE 文本片段"""

    full_messages = [
        {"role": "system", "content": SOCRATIC_SYSTEM_PROMPT},
        *messages,
        {"role": "user", "content": build_user_message(node_label, node_sub, user_input)},
    ]

    stream = client.chat.completions.create(
        model=settings.deepseek_model,
        messages=full_messages,
        stream=True,
        max_tokens=512,
        temperature=0.7,
    )

    for chunk in stream:
        delta = chunk.choices[0].delta
        if delta.content:
            yield delta.content