from openai import OpenAI
from core.config import settings
from .prompts import GENERATE_NODES_PROMPT, build_generate_prompt
import json

client = OpenAI(
    api_key=settings.deepseek_api_key,
    base_url=settings.deepseek_base_url,
)

def generate_graph(topic: str) -> dict:
    """调用 AI 生成知识图谱节点，返回解析后的 dict"""
    response = client.chat.completions.create(
        model=settings.deepseek_model,
        messages=[
            {"role": "system", "content": GENERATE_NODES_PROMPT},
            {"role": "user", "content": build_generate_prompt(topic)},
        ],
        max_tokens=2000,
        temperature=0.3,  # 低温度保证结构稳定
    )

    content = response.choices[0].message.content.strip()

    # 清理可能的 markdown 代码块
    if content.startswith("```"):
        content = content.split("```")[1]
        if content.startswith("json"):
            content = content[4:]
    content = content.strip()

    return json.loads(content)


def assign_positions(nodes: list) -> list:
    """自动计算节点坐标，树形布局"""
    # 建立父子关系
    children_map: dict = {}
    root_keys = []

    for n in nodes:
        parents = n.get("parent_keys", [])
        if not parents:
            root_keys.append(n["key"])
        for p in parents:
            children_map.setdefault(p, []).append(n["key"])

    # BFS 分层
    layers = []
    current_layer = root_keys
    visited = set(root_keys)

    while current_layer:
        layers.append(current_layer)
        next_layer = []
        for key in current_layer:
            for child in children_map.get(key, []):
                if child not in visited:
                    visited.add(child)
                    next_layer.append(child)
        current_layer = next_layer

    # 计算坐标
    positions = {}
    y_start = 100
    y_gap = 160

    for i, layer in enumerate(layers):
        y = y_start + i * y_gap
        count = len(layer)
        x_start = 300 - (count - 1) * 150
        for j, key in enumerate(layer):
            positions[key] = {"x": x_start + j * 300, "y": y}

    # 写回坐标
    for n in nodes:
        pos = positions.get(n["key"], {"x": 300, "y": 100})
        n["x"] = pos["x"]
        n["y"] = pos["y"]

    return nodes