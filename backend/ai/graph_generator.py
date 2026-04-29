from openai import OpenAI
from core.config import settings
from .prompts import GENERATE_NODES_PROMPT, build_generate_prompt
import json

client = OpenAI(
    api_key=settings.deepseek_api_key,
    base_url=settings.deepseek_base_url,
)

def generate_graph(topic: str) -> dict:
    response = client.chat.completions.create(
        model=settings.deepseek_model,
        messages=[
            {"role": "system", "content": GENERATE_NODES_PROMPT},
            {"role": "user", "content": build_generate_prompt(topic)},
        ],
        max_tokens=2000,
        temperature=0.3,
    )

    content = response.choices[0].message.content.strip()

    if content.startswith("```"):
        content = content.split("```")[1]
        if content.startswith("json"):
            content = content[4:]
    content = content.strip()

    return json.loads(content)


def assign_positions(nodes: list) -> list:
    """智能树形布局，根据节点数量动态调整坐标"""

    # 建立父子关系
    children_map: dict = {}
    root_keys = []

    for n in nodes:
        parents = n.get("parent_keys", [])
        if not parents:
            root_keys.append(n["key"])
        for p in parents:
            children_map.setdefault(p, []).append(n["key"])

    # 如果没有根节点，取第一个
    if not root_keys and nodes:
        root_keys = [nodes[0]["key"]]

    # BFS 分层，去重
    layers: list = []
    visited = set(root_keys)
    current_layer = root_keys[:]

    while current_layer:
        layers.append(current_layer)
        next_layer = []
        for key in current_layer:
            for child in children_map.get(key, []):
                if child not in visited:
                    visited.add(child)
                    next_layer.append(child)
        current_layer = next_layer

    # 未被分层的孤立节点放最后
    all_keys = {n["key"] for n in nodes}
    orphans = [k for k in all_keys if k not in visited]
    if orphans:
        layers.append(orphans)

    # 动态计算画布尺寸
    max_per_layer = max(len(l) for l in layers) if layers else 1
    total_layers = len(layers)

    # 节点间距：根据每层最多节点数决定水平间距
    node_w = 140  # 节点宽度估算
    h_gap = max(180, node_w * 1.4)  # 水平间距
    v_gap = max(140, min(180, 800 // max(total_layers, 1)))  # 垂直间距

    # 画布宽度：保证最宽一层能放下
    margin = 100
    canvas_w = max(600, margin * 2 + (max_per_layer - 1) * h_gap)
    y_start = 120

    # 计算每个节点的坐标
    positions = {}
    for i, layer in enumerate(layers):
        y = y_start + i * v_gap
        count = len(layer)

        if count == 1:
            x_list = [canvas_w / 2]
        else:
            total_width = (count - 1) * h_gap
            x_start = (canvas_w - total_width) / 2
            x_list = [x_start + j * h_gap for j in range(count)]

        for j, key in enumerate(layer):
            positions[key] = {
                "x": round(x_list[j]),
                "y": round(y),
            }

    # 写回节点坐标
    key_map = {n["key"]: n for n in nodes}
    for key, pos in positions.items():
        if key in key_map:
            key_map[key]["x"] = pos["x"]
            key_map[key]["y"] = pos["y"]

    # 未分配坐标的节点补充到最底部
    canvas_h = y_start + total_layers * v_gap + 100
    unpositioned = [n for n in nodes if "x" not in n or n.get("x") == 0]
    for i, n in enumerate(unpositioned):
        n["x"] = margin + i * h_gap
        n["y"] = canvas_h

    return nodes