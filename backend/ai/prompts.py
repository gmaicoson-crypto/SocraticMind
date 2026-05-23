from pathlib import Path

# 所有 prompt 文件统一存放在 ai/prompts/ 目录下，以 .md 格式维护，便于单独编辑和版本追踪
_DIR = Path(__file__).parent / "prompts"


def _load(name: str) -> str:
    """从 prompts 目录加载指定名称的 .md 文件内容。"""
    return (_DIR / f"{name}.md").read_text(encoding="utf-8")


# 苏格拉底式教学 prompt，对应三种 AI 风格
SOCRATIC_GENTLE_PROMPT   = _load("socratic_gentle")
SOCRATIC_STANDARD_PROMPT = _load("socratic_standard")
SOCRATIC_STRICT_PROMPT   = _load("socratic_strict")
_MASTERED_RULES          = _load("mastered_rules")  # 掌握判断规则，附加在所有苏格拉底 prompt 末尾

# 各场景的独立 prompt
TOPIC_OVERVIEW_PROMPT   = _load("topic_overview")    # 主题概览（约 500 字）
NODE_OVERVIEW_PROMPT    = _load("node_overview")     # 节点概览（约 100 字 + 引导问题）
NORMAL_CHAT_PROMPT      = _load("normal_chat")       # 普通对话模式
GENERATE_NODES_PROMPT   = _load("generate_nodes")    # 生成知识图谱节点
RECOMMEND_TOPICS_PROMPT = _load("recommend_topics")  # 推荐学习主题


def get_socratic_prompt(ai_style: str) -> str:
    """根据用户设置的 AI 风格返回对应的苏格拉底式 prompt，并追加掌握判断规则。"""
    if ai_style == "温和":
        return SOCRATIC_GENTLE_PROMPT + _MASTERED_RULES
    elif ai_style == "严格":
        return SOCRATIC_STRICT_PROMPT + _MASTERED_RULES
    return SOCRATIC_STANDARD_PROMPT + _MASTERED_RULES


def build_topic_overview_prompt(topic_title: str) -> str:
    return f"用户想学习「{topic_title}」这个主题。请按要求生成主题概览。"


def build_node_overview_prompt(node_label: str, node_sub: str) -> str:
    return f"当前节点：{node_label}（{node_sub}）。请按要求给出节点概览。"


def build_user_message(node_label: str, node_sub: str, user_input: str) -> str:
    """将节点上下文和用户输入拼接成发给 AI 的 user 消息。"""
    return f"当前学习节点：{node_label}（{node_sub}）\n\n学生说：{user_input}"


def build_recommend_prompt(topics: list[str]) -> str:
    topics_str = "、".join(topics)
    return f"用户当前正在学习：{topics_str}。请推荐接下来适合学习的 3 个主题。"


def build_generate_prompt(topic: str) -> str:
    return f"请为「{topic}」这个主题生成知识图谱节点。"


NORMAL_SUGGESTIONS_PROMPT = _load("suggestions_normal")


def build_socratic_suggestions_prompt(context: str) -> str:
    """根据用户当前学习的节点上下文，生成苏格拉底模式下的快捷建议 prompt。"""
    return _load("suggestions_socratic").replace("__CONTEXT__", context)
