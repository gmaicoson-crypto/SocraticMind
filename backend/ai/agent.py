from openai import OpenAI
from core.config import settings
from .prompts import SOCRATIC_SYSTEM_PROMPT,NORMAL_CHAT_PROMPT, build_user_message
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
    mode: str = "socratic",
) -> Generator[str, None, None]:

    system_prompt = SOCRATIC_SYSTEM_PROMPT if mode == "socratic" else NORMAL_CHAT_PROMPT

    if mode == "socratic":
        user_content = build_user_message(node_label, node_sub, user_input)
    else:
        user_content = user_input

    full_messages = [
        {"role": "system", "content": system_prompt},
        *[m for m in messages if m.get("role") in {"user", "assistant"}],
        {"role": "user", "content": user_content},
    ]

    stream = client.chat.completions.create(
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