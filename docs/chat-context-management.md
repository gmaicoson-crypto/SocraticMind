# 对话上下文管理

前端只提交本轮输入；后端按当前模型的容量组合近期原文、较早会话摘要和主题背景。部署代码前需升级数据库，本次新增 `0010_chat_context_management`：

```bash
cd backend
.venv/bin/python -m alembic upgrade head
```

迁移新增 `chat_sessions`、`chat_turns`、`chat_cancellations`，保留已有消息，并为归属明确的开发会话回填完整问答关系。混合主题或残缺数据保留原文，读取时仍按用户、主题和模式隔离。应用启动会检查迁移版本，并启动数据库驱动的摘要后台线程。多进程通过数据库租约竞争任务，无需额外消息队列。

## 容量与模型配置

| 配置项 | 默认 token 数 | 说明 |
| --- | ---: | --- |
| `context_window_tokens` | 256000 | 按所有已接入模型的 256K 窗口保守配置 |
| `max_output_tokens` | 4096 | 服务允许的生成上限 |
| `output_tokens` | 4096 | 本次预留的生成额度，按服务参数语义包含推理等开销 |
| `reasoning_output_tokens` | 未设置 | 推理模型配置可单独覆盖生成额度，需同时设置足够的 `max_output_tokens` |
| `safety_margin_tokens` | 8192 | 消息封装及计数误差余量 |
| `target_input_tokens` | 64000 | 日常输入目标，摘要落后时可临时超过 |
| `summary_trigger_tokens` | 48000 | 摘要触发阈值 |
| `summary_target_tokens` | 32000 | 压缩后近期上下文的目标预算 |

输入硬上限为 `min(context_window_tokens - output_tokens - safety_margin_tokens, max_input_tokens)`；没有独立 `max_input_tokens` 时忽略第二项。默认是 **243712 token**。全部系统提示、参考资料、历史和当前问题都参加最终计数；摘要及其 JSON 修复请求同样校验。

配置 `reasoning_output_tokens` 后，上式使用该额度替代 `output_tokens`。例如服务实际支持时，设置 `reasoning_output_tokens=12288`、`max_output_tokens=16384`，输入硬上限为 **235520 token**。不能只按可见回答长度预留推理模型的生成空间。

环境模型可在已有 `LLM_MODELS` 的对象中添加以上可选字段。还支持：

- `tokenizer_encoding`：默认按模型名识别 tiktoken 编码；未知模型使用 UTF-8 字节数保守估算。可明确填写服务匹配的编码，或填写 `utf8_bytes`。
- `completion_token_parameter`：`auto`、`max_tokens` 或 `max_completion_tokens`。
- `stream_usage`：默认 `true`；服务不支持流式 usage 参数时设为 `false`。
- `temperature`：默认 `0.7`；不支持温度参数时可设为 `null`。

用户自定义模型使用相同的 256K 默认容量。窗口相同不代表分词规则相同：正文分词与消息封装计数的准确性不同，日志会记录实际计数方式。未知模型可能提前压缩，不能将估算宣称为服务端精确值。生成额度和窗口配置变更后，每次调用都会重新计算预算。

## 发起请求与恢复

`POST /api/chat/stream` 必须带 `request_id`，不再接受 `history`。普通对话的 `topic_id` 使用 `0`；学习对话提供实际主题和节点。请求示例：

```json
{
  "request_id": "94b09c38-f41c-47f3-a025-a47495446c8f",
  "session_id": "normal-session-1",
  "node_key": "normal",
  "topic_id": 0,
  "mode": "normal",
  "user_input": "请解释递归"
}
```

新问题使用新的请求 ID。网络中断、不确定请求是否已受理时复用相同 ID及原参数；已完成的请求重放保存结果，不再次调用模型。运行中返回 `CHAT_REQUEST_RUNNING`，同会话的另一个生成请求返回 `CHAT_SESSION_BUSY`。改变内容而复用请求 ID 会返回 `CHAT_REQUEST_CONFLICT`。

SSE 在正文前发出 `msg_ids`，成功后发出 `request_state.status=complete` 和 `[DONE]`。失败通过结构化 `error` 返回；单纯连接关闭不表示成功。窗口超限返回 HTTP 413 和 `CHAT_CONTEXT_TOO_LARGE`，并提供已保存消息的 ID。

仅模型以 `stop` 正常结束且有正文时才保存为完整回答。输出额度耗尽返回 `AI_OUTPUT_LIMIT`；连接提前结束返回 `AI_STREAM_INCOMPLETE`。已显示内容保存为 `interrupted`，可以输入“继续”衔接，不能作为完整轮次进入摘要。内容过滤或其他异常结束状态同样不会标记成功。

重新生成使用新 `request_id` 和 `regenerate_message_id`，复用原问题及原节点、类型。当前仅允许重新生成最后一轮。生成时排除旧答案，成功后替换有效回答，失败或空回复保留原答案。AI 消息元数据包含 `user_message_id`、`kind`、`node_key`，用于刷新后恢复这组关系。

`POST /api/chat/cancel` 接收 `session_id`、`request_id`。取消记录先持久化，即使请求尚未落库也不能在稍后重新启动。已有消息时返回 `msg_ids`，后续重试使用新 ID 和原回答作为重新生成目标。

## 会话摘要与主题背景

原文始终保存在 `chat_messages`。`chat_turns` 关联问题及有效回答，`chat_sessions` 保存所属用户、主题、模式、摘要、处理游标、内容版本和任务租约。

读取以完整问答为单位，近期对话优先保留。有效摘要替换其已经覆盖的较早轮次，避免重复发送；用户明确引用的原文纳入预算，在历史中再次出现时只保留位置标记，避免全文发送两遍。未完成回答在后续问答中明确标记状态。当前节点和计划的真实状态优先于旧摘要。

主题背景限定在同一用户和主题内：复用学习记忆，再选取讨论过相同节点或其直接前置节点的其他会话摘要，相同节点优先。相关性复用知识图谱的 `parent_keys`，无需新增向量检索。普通会话不会聚合所有 `topic_id` 为空的对话。自动摘要不写入 `LearnerMemory`，也不改变节点掌握状态。

摘要在成功回复后达到阈值时入队，处理较早完整轮次，并保留近期原文。摘要包含目标、讨论结论、未解决问题和来源消息 ID；服务端校验引用 ID及节点范围。摘要任务分批处理，在数据库事务之外调用模型。旧摘要可能遗漏细节，精确引用以原文为准。

64K／48K／32K 是常规软目标，当前问题、引用或近期完整轮次较长时可以超过；绝不能突破模型输入硬上限。如果摘要落后且原文无法全部放入硬窗口，SSE 发出 `context_compacting`，复用持久任务执行一次有界整理，再重新计数。成功后发出 `context_ready` 并继续回答；仍无法容纳时返回 `CHAT_CONTEXT_NOT_READY`，保留聊天记录和问题，提示稍后重试。不会把已知遗漏旧历史的请求静默发送给模型。

删除消息、删除会话或成功替换回答会使对应摘要失效。任务写回同时核对内容版本、摘要版本和租约，防止已删除内容恢复。同会话只允许一个生成请求，租约过期后可以恢复。

## 验证与排查

从仓库根目录运行格式检查：

```bash
node scripts/format.mjs --check
```

后端定向验证涵盖预算边界、上下文来源、摘要任务、轮次状态及迁移；测试使用隔离数据库和模型替身：

```bash
cd backend
.venv/bin/python -m pytest tests/p0/test_context_budget.py tests/p0/test_context_integration.py tests/p0/test_chat_context_edges.py tests/p0/test_chat_summaries.py tests/p0/test_chat_lifecycle.py tests/p0/test_chat_context.py tests/p0/test_migrations.py
```

观察 `chat_context_prepared`、`chat_first_token`、`chat_token_usage` 和 `chat_summary_complete` 日志，比较输入大小、首字延迟与摘要成本。`chat_token_usage` 记录实际 usage、本地估算与输入计数差值。服务没有提供 usage 时，只能使用本地估算；不要将其当作实际账单。

摘要失败会退避重试，达到上限后保留失败状态；原文和有效旧摘要仍可参与回答。处理模型配置或服务故障后，可将对应 `chat_sessions` 的 `summary_status` 设为 `pending`、`summary_attempts` 设为 `0`、`summary_next_retry_at` 清空，后台会重新领取。运行中任务的过期租约也会自动恢复。

代码对应关系：容量控制位于 `core/context_budget.py`；组装位于 `services/chat_context.py`；生命周期位于 `services/chat_lifecycle.py`；摘要执行位于 `services/chat_summaries.py`。相关测试分别验证这些行为及 API 的组合结果。
