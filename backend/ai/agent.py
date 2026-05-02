from core.config import settings
from core.ai_client import get_ai_client
from .prompts import get_socratic_prompt, NORMAL_CHAT_PROMPT, build_user_message
from typing import Generator


def chat_stream(
    messages: list,
    node_label: str,
    node_sub: str,
    user_input: str,
    mode: str = "socratic",
    ai_style: str = "标准",
) -> Generator[str, None, None]:
    """yield 模型流式片段；调用方累积完整文本后扫描 [MASTERED] / [CONFIRM_MASTER] 信号。"""
    system_prompt = get_socratic_prompt(ai_style) if mode == "socratic" else NORMAL_CHAT_PROMPT

    user_content = (
        build_user_message(node_label, node_sub, user_input)
        if mode == "socratic"
        else user_input
    )

    full_messages = [
        {"role": "system", "content": system_prompt},
        *[m for m in messages if m.get("role") in {"user", "assistant"}],
        {"role": "user", "content": user_content},
    ]

    stream = get_ai_client().chat.completions.create(
        model=settings.deepseek_model,
        messages=full_messages,
        stream=True,
        max_tokens=4096,
        temperature=0.7,
    )

    for chunk in stream:
        delta = chunk.choices[0].delta
        if delta.content:
            yield delta.content