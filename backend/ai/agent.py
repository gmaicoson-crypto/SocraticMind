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
    """向 AI 发起流式请求，逐块 yield 文本片段；调用方累积完整回复后再检测 [MASTERED] 等信号。

    kind 参数说明：
      - "qa"             默认 Q&A 模式；socratic 模式用苏格拉底式提问 prompt，normal 模式用普通 prompt
      - "topic_overview" 生成约 500 字的主题概览介绍
      - "node_overview"  生成约 100 字的节点概览 + 一个引导性问题
    """
    if kind == "topic_overview":
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

    # overview 类请求是开场白，不携带历史消息；qa 模式带最近若干轮以维持上下文连贯性
    history_msgs = (
        []
        if kind in {"topic_overview", "node_overview"}
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

    for chunk in stream:
        # OpenAI 兼容反代可能在流末尾发送仅包含 usage 等元数据的分片，
        # 这类分片没有 choices，不应当被当作正文读取。
        if not chunk.choices:
            continue

        content = getattr(chunk.choices[0].delta, "content", None)
        if content:
            yield content
