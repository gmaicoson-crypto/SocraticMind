from core.config import settings
from core.ai_client import get_ai_client
from .prompts import (
    get_socratic_prompt,
    NORMAL_CHAT_PROMPT,
    build_user_message,
    TOPIC_OVERVIEW_PROMPT,
    build_topic_overview_prompt,
    NODE_OVERVIEW_PROMPT,
    build_node_overview_prompt,
)
from typing import Generator


def chat_stream(
    messages: list,
    node_label: str,
    node_sub: str,
    user_input: str,
    mode: str = "socratic",
    ai_style: str = "标准",
    kind: str = "qa",
) -> Generator[str, None, None]:
    """yield 模型流式片段；调用方累积完整文本后扫描 [MASTERED] 等信号。

    kind:
      - "qa"             默认；socratic 模式下用 Socratic prompt，normal 模式用 NORMAL_CHAT_PROMPT
      - "topic_overview" 主题概览（约 500 字）
      - "node_overview"  节点概览（约 100 字 + 一个引导问题）
    """
    if kind == "topic_overview":
        # node_label 此时承载的是主题名
        system_prompt = TOPIC_OVERVIEW_PROMPT
        user_content = build_topic_overview_prompt(node_label)
    elif kind == "node_overview":
        system_prompt = NODE_OVERVIEW_PROMPT
        user_content = build_node_overview_prompt(node_label, node_sub)
    elif mode == "socratic":
        system_prompt = get_socratic_prompt(ai_style)
        user_content = build_user_message(node_label, node_sub, user_input)
    else:
        system_prompt = NORMAL_CHAT_PROMPT
        user_content = user_input

    # overview 模式下不带历史（开场白）；qa 模式带最近若干轮以维持上下文
    history_msgs = (
        [] if kind in {"topic_overview", "node_overview"}
        else [m for m in messages if m.get("role") in {"user", "assistant"}]
    )

    full_messages = [
        {"role": "system", "content": system_prompt},
        *history_msgs,
        {"role": "user", "content": user_content},
    ]

    stream = get_ai_client().chat.completions.create(
        model=settings.deepseek_model,
        messages=full_messages,
        stream=True,
        max_tokens=4096,
        temperature=0.7,
    )

    full_response = []
    for chunk in stream:
        delta = chunk.choices[0].delta
        if delta.content:
            full_response.append(delta.content)
            yield delta.content

    # Debug: 打印完整 AI 回复以排查 [CHOICES] 是否出现
    full_text = "".join(full_response)
    print(f"[DEBUG] AI 回复长度: {len(full_text)}, 包含 [CHOICES]: {'[CHOICES]' in full_text}, 包含 [ECHOICES]: {'[ECHOICES]' in full_text}")
    if "[CHOICES]" not in full_text:
        print(f"[DEBUG] AI 回复末尾 200 字符: ...{full_text[-200:]}")
