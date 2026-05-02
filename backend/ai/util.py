def extract_json_from_markdown(text: str) -> str:
    """剥掉 LLM 常见的 ```json ... ``` 代码块外壳，返回纯 JSON 字符串。

    DeepSeek/OpenAI 在 system prompt 要求"只返回 JSON"时仍会偶发包裹代码块，
    若直接 json.loads 会失败；统一在解析前先剥壳，避免每个调用点重复同一段处理。
    """
    s = text.strip()
    if s.startswith("```"):
        # 取代码块内部内容
        s = s.split("```")[1]
        if s.startswith("json"):
            s = s[4:]
    return s.strip()
