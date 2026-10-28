# Backend

SocraticMind 后端是基于 FastAPI、SQLAlchemy 和 OpenAI 兼容 LLM 接口构建的 API 服务。它负责用户认证、可恢复 Learning Agent、知识图谱、学习计划、节点评估、学习记忆、AI 对话和学习统计。

## 技术栈

- Python
- FastAPI
- Uvicorn
- SQLAlchemy
- Pydantic Settings
- JWT + OAuth2 Password Flow
- Passlib
- 可恢复 Agent 状态机与 Pydantic 结构化输出
- OpenAI Python SDK 兼容调用
- MySQL 或其他 SQLAlchemy 支持的数据库

## 环境要求

- Python 3.10 或更高版本
- 可访问的 MySQL 数据库
- 一个或多个 OpenAI Chat Completions 兼容服务的 API Key、地址和模型 ID
- 可选 SMTP 邮件服务，用于发送注册和找回密码验证码

## 快速启动

进入后端目录：

```bash
cd backend
```

创建虚拟环境：

```bash
python -m venv .venv
```

Windows PowerShell 激活虚拟环境：

```powershell
.\.venv\Scripts\Activate.ps1
```

安装依赖：

```bash
pip install -r requirements.txt
```

创建 `.env`：

```bash
copy .env.example .env
```

根据本地环境修改 `.env`，至少需要配置：

```env
LLM_MODELS=[
  {
    "MODEL": "deepseek-chat",
    "API_KEY": "your_deepseek_key",
    "BASE_URL": "https://api.deepseek.com/v1",
    "NAME": "DeepSeek"
  },
  {
    "MODEL": "gpt-4o-mini",
    "API_KEY": "your_openai_key",
    "BASE_URL": "https://api.openai.com/v1",
    "NAME": "OpenAI"
  }
]
SECRET_KEY=change_me_to_a_random_secret_string

DATABASE_URL=mysql+pymysql://root:your_password@localhost:3306/socraticmind
CORS_ORIGINS=http://localhost:5173
```

先升级数据库，再启动服务：

```bash
alembic upgrade head
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

默认访问地址：

```text
http://127.0.0.1:8000
```

接口文档：

```text
http://127.0.0.1:8000/docs
```

健康检查：

```text
http://127.0.0.1:8000/health
```

## 环境变量

| 变量 | 必填 | 说明 | 示例 |
| --- | --- | --- | --- |
| `LLM_MODELS` | 是 | OpenAI 兼容服务的 JSON 数组；每项只需 `MODEL`、`API_KEY`、`BASE_URL`、`NAME`，第一项为默认模型 | 见 `.env.example` |
| `SECRET_KEY` | 是 | JWT 签名密钥 | `a-long-random-string` |
| `DATABASE_URL` | 是 | SQLAlchemy 数据库连接 URL | `mysql+pymysql://root:pass@localhost:3306/socraticmind` |
| `CORS_ORIGINS` | 否 | 允许访问 API 的前端来源，多个值用逗号分隔 | `http://localhost:5173` |
| `SMTP_HOST` | 否 | SMTP 服务器地址 | `smtp.example.com` |
| `SMTP_PORT` | 否 | SMTP 端口 | `465` 或 `587` |
| `SMTP_USER` | 否 | SMTP 用户名 | `user@example.com` |
| `SMTP_PASSWORD` | 否 | SMTP 密码或授权码 | `password` |
| `SMTP_FROM` | 否 | 发件人地址 | `SocraticMind <user@example.com>` |
| `SMTP_USE_TLS` | 否 | 是否使用 TLS | `true` |
| `APP_NAME` | 否 | 邮件模板中的应用名称 | `SocraticMind` |

同一个 `BASE_URL` 与 `MODEL` 组合只能配置一次，以保持内部 ID 稳定。旧版 `.env` 中的小写字段、`id`、`LLM_DEFAULT_MODEL_ID` 和单模型 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL` 仍可读取，便于现有部署逐步迁移。

登录后，用户可以在首页对话区的模型下拉框中添加自己的四项配置；选中用户模型后，可从同一下拉框编辑或删除。用户模型保存在 `user_llm_profiles` 表中，API Key 使用服务端 `SECRET_KEY` 加密；内部 ID 自动生成，与环境模型互不冲突。对话下拉框显示环境模型和用户模型，个人页不展示模型配置。模型列表接口不返回环境模型的 API Key 或请求地址。

如果未配置 SMTP，验证码发送逻辑会按 `core/email.py` 中的实现进行降级处理，适合本地调试时查看控制台输出。

## 数据库

数据库结构由 Alembic 管理，应用启动不会自动创建或修改表。

空数据库直接升级：

```bash
alembic upgrade head
```

已有 SocraticMind 数据库必须先备份并核对结构与 `0001_current_schema_baseline` 一致，再执行：

```bash
alembic stamp 0001_current_schema_baseline
alembic upgrade head
```

不要对未知结构的数据库盲目执行 `stamp`。Alembic 只管理表结构，仍需提前创建 MySQL 数据库本身。

应用启动时会校验 `alembic_version` 必须等于当前 head。缺少版本表或 revision 落后时，Uvicorn 会明确失败；先执行迁移，不要绕过守卫。

升级前后应分别核对 `users`、`topics`、`nodes`、`chat_messages` 等旧表计数。若升级失败，停止应用并把备份恢复到新建空库，再修复迁移问题；不要在未验证备份时执行 downgrade。完整演练记录见 [`../docs/P0-learning-agent-acceptance-report.md`](../docs/P0-learning-agent-acceptance-report.md)。

当前主要数据模型包括：

- `User`：用户账号、密码哈希、头像、个人偏好
- `Topic`：学习主题
- `Node`：知识图谱节点
- `ChatMessage`：用户和 AI 的对话记录
- `ChatSession` / `ChatTurn` / `ChatCancellation`：会话摘要、有效轮次、请求幂等与持久取消状态
- `LearningRecord`：学习打卡记录
- `EmailCode`：邮箱验证码
- `AgentRun`：可恢复的 onboarding、计划和评估运行状态
- `StudyPlan` / `StudyPlanItem`：按依赖和时区排期的学习计划
- `AssessmentAttempt` / `MasteryEvent`：正式评估与可审计掌握事件
- `LearnerMemory`：有范围、来源和长度约束的长期学习记忆

头像上传文件会保存到：

```text
backend/uploads/avatars/
```

并通过以下静态路径访问：

```text
/static/avatars/<filename>
```

## 主要接口模块

| 模块 | 前缀 | 说明 |
| --- | --- | --- |
| `routers/auth.py` | `/api/auth` | 注册、登录、验证码、用户资料、头像、密码、注销 |
| `routers/topics.py` | `/api/topics` | 主题列表、AI 生成主题、删除主题、修改主题、推荐主题 |
| `routers/nodes.py` | `/api/nodes` | 节点列表、节点搜索、创建节点、标记掌握 |
| `routers/chat.py` | `/api/chat` | SSE 流式 AI 对话、历史消息、快捷建议、删除消息 |
| `routers/progress.py` | `/api/progress` | 学习打卡、连续学习天数、统计和热力图 |
| `routers/agent.py` | `/api/agent` | Onboarding、run 恢复/作答/确认/取消/重试、已有主题计划和评估 |
| `routers/plans.py` | `/api/plans`、`/api/topics/{id}/plan` | 今日计划、主题计划和重新规划 |
| `routers/memories.py` | `/api/agent/memories` | 学习记忆 CRUD 与筛选 |

`POST /api/topics/generate` 仅保留为 deprecated 兼容端点，并返回 onboarding 提示；新客户端必须从 `POST /api/agent/onboarding` 开始。

## AI 能力

后端通过 `core/ai_client.py` 创建兼容 OpenAI SDK 的客户端，并在以下场景调用 AI：

对话由后端统一管理 256K 上下文窗口，前端请求不传历史。首次运行新增版本前执行 `alembic upgrade head`；模型容量、摘要后台任务和请求恢复的具体用法见 [上下文管理说明](../docs/chat-context-management.md)。

- `ai/agent.py`：根据当前节点、用户输入、历史消息和模式生成流式回复
- `ai/graph_generator.py`：为新主题生成知识节点和依赖关系
- `routers/topics.py`：推荐学习主题
- `routers/chat.py`：生成快捷回复建议

提示词文件位于：

```text
backend/ai/prompts/
```

主要支持苏格拉底式引导、普通聊天、主题概览、节点概览、掌握判断和主题推荐。

### 问答自动联网

普通及节点问答由后端统一采用自动联网策略，概览关闭检索。前端不提供联网开关，也不提交 `web_mode`；后端先使用本轮所选模型判断是否需要外部资料，必要时通过 Tavily 检索最多两个查询、五条来源，再沿用现有回答流输出可追溯引用。前端展示检索状态、正文引用和来源列表，历史恢复及重新生成保留对应来源。上下文容量裁剪的技术提示只保留在后端记录中，不展示给用户。

后端默认关闭此能力。后续进行真实服务验收时，在 `.env` 配置：

```env
WEB_SEARCH_ENABLED=true
TAVILY_API_KEY=your_tavily_key
```

先执行 `alembic upgrade head`，再重启服务。迁移 `0011_web_search_quotas` 增加跨进程共享的日查询配额账本；来源仍保存在消息 metadata，不新建检索结果表。默认每用户每天 100 次查询、全局每天 1,000 次查询，按 UTC 原子预占；取消、超时或删除消息不返还可能已计费的查询额度。配置为 `0` 表示禁止搜索，完整预算和并发配置见 `.env.example`。

登录后可通过 `GET /api/chat/capabilities` 诊断可用状态，返回 `available` 和固定策略 `mode=auto`；输入栏无需调用该接口。关闭总开关或缺少密钥时，回答保留不可用提示并降级；搜索失败不影响普通回答，回答不能宣称已核实最新事实。停止、幂等重放和来源写回复用聊天生命周期。指定 URL 全文读取尚未支持。

本次仅完成实现及离线测试，没有调用真实 LLM 或 Tavily，也没有修改业务数据库。60 条决策样本为待人工复核草案，尚无真实质量、延迟或费用结果；运行真实验收前保持默认关闭。详细契约、取舍、配置和定向测试入口见 [自动联网规划及实施记录](../docs/ai-web-search-plan.md)。

### 教材 RAG 与语义索引

当前交付使用关键词、章节覆盖和指定位置检索，`KNOWLEDGE_EMBEDDING_ENABLED` 默认保持 `false`。LangGraph、诊断计划、教材教学、评估及复习可在此配置下完整运行，不需要配置 embedding 服务。真实语义接入与质量验收已按用户决定延期；已有适配保留，以下启用配置仅供后续接入使用。关键词模式可能漏掉同义改写，检索不足时应补充教材术语或明确章节/页码。

在学习引导中选择已解析文档，或在「我的主题 → 管理学习资料」绑定教材。诊断和计划使用固定版本的来源，主题问答与概览可跨会话检索显式绑定的教材。未选资料不参与检索，删除、换版本或解绑会使相关来源失效。默认使用关键词或指定页码检索；计划预览按文档和章节覆盖抽取，不声称已经阅读全文。

语义检索使用 OpenAI 兼容 embedding 接口。可复用已有 LLM 服务的地址与密钥，但必须选择服务实际支持的 embedding 模型。先备份数据库并执行 `alembic upgrade head`；新增 `0017_knowledge_indexes` 只追加向量与任务表，保留已有迁移链。复用默认 LLM 连接时，在后端环境文件设置：

```env
KNOWLEDGE_EMBEDDING_ENABLED=true
KNOWLEDGE_EMBEDDING_LLM_PROFILE=default
KNOWLEDGE_EMBEDDING_MODEL=your-embedding-model
```

`LLM_PROFILE` 也可填服务端 `LLM_MODELS` 的 ID、唯一名称或模型名；固定某个配置可避免默认聊天服务变更影响索引。只继承连接，不继承聊天模型名；前端选择的聊天模型与用户自定义配置不会改变共享索引服务。继承时 `KNOWLEDGE_EMBEDDING_BASE_URL` 和 `KNOWLEDGE_EMBEDDING_API_KEY` 必须留空，以免把已有密钥发往覆盖后的地址。使用独立服务则将 `LLM_PROFILE` 留空，显式设置上述地址和密钥。更换实际地址或 embedding 模型会使用新的索引指纹。

地址、模型和密钥需替换为实际配置。支持本地兼容服务；如模型要求 `query: ` 或 `passage: ` 前缀，使用 `.env.example` 中对应字段。`dimensions` 只在明确配置时发送，返回维度最多 4096。余弦阈值默认 0.5，需要针对所用模型校准；排名融合分值不代表答案置信度。协议依据见 [embedding 接口文档](https://developers.openai.com/api/reference/resources/embeddings/methods/create)。

API 启动时运行 `knowledge-index` worker。选择或绑定资料只写任务，后台每批最多 16 个输入，每个输入最多 6000 UTF-8 字节；长分块分段向量化并聚合，不静默截断正文。每批默认总超时 8 秒，失败最多自动尝试 3 次，过期租约可接管，界面可手动重试。向量按文档版本、配置指纹和正文 hash 缓存；换模型后建立独立索引，重复提问仅向量化问题。删除文档在同一事务清理向量和任务。

索引就绪后将关键词与向量排名融合。尚未就绪、配置错误或供应商失败会明确降级；精确页码查询不调用 embedding。资料界面显示索引状态，刷新可查看进度；聊天来源事件记录检索方式、耗时和降级提示。任务保存请求次数、已知 token 与未知用量次数，未知用量不能当作零费用。

检索评测在隔离的内存数据库中构造公开测试教材，不读取业务数据。从 `backend/` 执行：

```bash
# 不调用外部服务，建立关键词基线
.venv/bin/python -m scripts.evaluate_knowledge_retrieval --lexical-only --output /tmp/retrieval-lexical.json
# 使用已配置的真实 embedding 服务；会消耗该服务额度
.venv/bin/python -m scripts.evaluate_knowledge_retrieval --output /tmp/retrieval-hybrid.json
```

报告包含 Recall@5、标注片段命中率、无答案弃答率、P50/P95 延迟和已知 token 用量。`semantic_evaluated=false` 表示没有完成真实语义评测，不能拿受控向量测试或关键词基线声称语义质量已达标。该小型语料用于回归和初步校准，生产验收还需用户领域样本；标注片段命中率也不等于生成答案正确率。

### 学习计划的 LangGraph 执行

引导与现有主题计划通过 `services/agent/workflow.py` 编译的真实图执行：出题 → 等待答案 → 评分 → 图谱 → 排期 → 等待确认 → 原子确认。未启用诊断和已有图谱时跳过对应生成节点。继续复用 `run_store` 的版本校验、现有模型调用、教材校验和确认事务；调整时间只重排计划。

迁移 `0018_agent_checkpoints` 在 `0017` 后追加检查点与 pending writes 表，SQLite 和 MySQL 通过同一个 SQLAlchemy saver 访问。检查点只保存步骤、版本和恢复指令；模型结果与教材引用仍由 AgentRun 持有，不额外复制原文或凭证。保存使用同步持久化模式，序列化关闭 pickle 并限制类型和单条大小。

等待答案与确认使用独立 `interrupt` 节点。恢复会重新进入暂停节点，因此模型调用与落库放在其他节点，并在重放前检查已经提交的结果；事务已完成而检查点丢失时，不重复生成成功结果或创建主题。接口鉴权后的 run ID 才能用于检查点读取，未开放任意 thread ID 操作接口。行为依据见 [LangGraph 暂停与恢复说明](https://docs.langchain.com/oss/python/langgraph/interrupts)。

迁移 `0019_agent_jobs` 在 `0018` 后追加持久命令表和创建请求唯一约束。引导与主题计划的创建、答题、改参、重试及确认接口提交命令后立即返回，响应通过 `processing`、`stage`、`version` 表示状态；读取接口不执行模型。创建可带稳定的 `request_id`，同一用户的同一请求重复发送返回原 run，内容不同返回 409。确认必须同时提交 `request_id` 与当前 `version`。

计划预览的「重新生成」通过 PATCH 显式发送 `regenerate=true`、稳定 `request_id` 与当前 `version`。同一意图重放返回已有结果，复用请求 ID 改变内容或提交旧版本返回 409；前端在响应丢失后保留请求 ID。新主题重新生成图谱但保留既有诊断与资料范围，已有主题保留业务节点并重新排期。仅修改时间参数仍不调用模型；目标变化重新评分和生成。`goal`、`daily_minutes`、`timezone` 不接受显式 null，`target_date=null` 可清除截止日期。

API 生命周期启动 `agent-jobs` supervisor，每个进程最多运行一个独立子进程；多个 API 实例通过数据库租约协调。当前固定预算为单用户最多 4 个排队/运行任务、租约 45 秒、心跳 2 秒、单次执行 600 秒、异常最多 3 次尝试并退避。等待答题/确认不占队列容量。取消使租约失效，模型结果和检查点发布均再次验证租约；监督进程终止失去租约或超时的子进程。正常关闭会终止执行并将任务重新入队，不消耗失败次数。数据库连接本身长期阻塞仍可能影响退出时限。

服务每 60 秒分批接管旧版本没有任务记录但仍处于处理中的计划 run，复用已保存题目和图谱。前端轮询使用退避、版本及会话归属校验，在等待输入、终态或卸载时停止；本地恢复索引缺失时通过 `GET /api/agent/runs/active?session_id=...` 查找当前用户的任务。创建请求 ID 在响应丢失后仍可复用，退出登录时清除。

收益是 HTTP 不再等待模型，异常中断后可接管；代价是额外的进程启动、租约与检查点写入。已用隔离 SQLite 验证并发、跨进程恢复、取消、迁移及真实 `main:app` 启停；未在真实 MySQL 上做并发负载验收。现有节点评估仍使用原同步执行路径，教材证据冻结与模型步骤观测均已接入。部署前运行 `alembic upgrade head`，不要改写已应用 revision。

SQLite 的 API、监督器及执行子进程统一通过 `create_runtime_engine` 启用连接级外键约束。删除 run 会级联清理检查点、pending writes、持久命令和调用记录；删除后到达的心跳/完成回写返回失效，不重建记录。迁移引擎保持 Alembic 原有行为，既有 revision 未改写。启用约束后，新的无效关联会被数据库拒绝；测试使用隔离文件数据库验证真实多连接行为。

完整后端学习路径验收见 `tests/p0/test_learning_acceptance.py`：资料选择、诊断、计划、确认、教材教学、评估、复习及删除清理，使用真实 OpenAI SDK HTTP/SSE 和实际 spawn worker。模型输出由本地测试服务控制，因此只证明生产调用链与来源传递；它不代表真实模型质量，也不是浏览器端到端测试。逐项验收与待完成的真实 embedding 评测见 [实施方案](../docs/2026-10-28-agent-langgraph-rag-plan.md)。

## 认证与安全

- 登录接口使用 OAuth2 Password Flow 表单字段，前端会把邮箱放入 `username` 字段。
- 登录成功后返回 JWT，前端在后续请求中通过 Bearer Token 传递。
- 受保护接口通过 `get_current_user` 校验当前用户。
- CORS 来源由 `CORS_ORIGINS` 控制，生产环境请改为真实域名。
- 注册、登录和验证码发送包含基础限流逻辑。
- 密码要求至少 8 位，并同时包含字母和数字。

## 开发提示

- 请从 `backend/` 目录启动服务，否则 `.env` 可能无法被正确加载。
- 修改环境变量后需要重启 Uvicorn。
- 如果使用 `mysql+pymysql://` 连接串，请确保环境中已安装 PyMySQL 驱动。
- 如果头像上传接口报 multipart 相关错误，请确保环境中已安装 `python-multipart`。
- P0 后端定向测试：`.venv/bin/python -m pytest tests/p0 tests/test_agent.py`。
- 迁移单项测试：`.venv/bin/python -m pytest tests/p0/test_migrations.py`。
- 测试使用固定模型 mock，不需要真实 AI、SMTP 或生产数据库。

## 上线检查

1. 备份目标 MySQL，并在隔离库验证备份可读取。
2. 核对旧库结构后再 `alembic stamp 0001_current_schema_baseline`；空库不执行 stamp。
3. 执行 `alembic upgrade head`，复核 revision 和旧数据计数。
4. 启动 API，检查 `/health`，再验证跨用户资源访问返回 403 或 404。
5. 确认日志不含 JWT、API Key、完整 prompt 或完整用户答案。


### 教材评估与复习

评估入口复用节点已确认的教材引用；没有节点引用时，在显式绑定的主题资料中检索一次。找不到相关正文时拒绝生成，避免将通用知识冒充教材结论。每题在作答前固定参考答案、量规、分值及来源版本，模型提供的来源编号必须属于实际检索结果。新增绑定资料不会改变已开始的题目或量规；原资料删除、解绑或版本变化时终止受影响的评估。

评分和复习只重新校验冻结来源并读取对应正文，不重新检索替换依据。模型返回后发布结果前再次校验，教材失效时不更新掌握状态。错题复习保留原题与量规，来源显示复用既有资料卡片，可定位页码/章节。Agent 结果、节点最新评估和聊天历史的正文在读取时重新加载，数据库历史只存来源引用；失效来源隐藏正文并显示不可用状态，历史分数保留。

职责入口为 `assessments.py`（创建/答题/重试/取消）、`assessment_generation.py`（出题与评分）、`assessment_state.py`（评估记录及失败持久化），教材适配放在 `knowledge/assessment_context.py`。旧版无教材评估保持原量规和评分方式。代价是每次答题及评分发布增加权限/版本查询；教材撤权后需要重新评估，不能继续按变更后的教材修改原题标准。


### Agent 调用记录与预算

迁移 `0020_agent_step_attempts` 延续 `0019`，保存诊断出题/评分、图谱生成、节点评估和复习评分的输入版本、阶段、状态、耗时、调用次数和用量。记录与业务事务分开提交，不改业务版本，不保存提示词、回答、教材正文、连接地址或密钥。结构化输出的每次修复都有独立状态、耗时、错误码与 token 记录；失败、超时、输出截断也计入。

用量已知时 `tokens` 为报告的累计值；任何尝试缺少供应商用量时 `tokens=null`、`usage_known=false`，`reported_tokens` 仅是已知部分，不能视为实际总成本。取消、停机、租约接管留下的调用标为 `interrupted`，迟到回写不能覆盖；模型输出通过结构校验但被教材/业务校验拒绝时标为 `rejected`。旧 `AgentRun.token_usage` 保持兼容，只累积已发布模型结果，不作为失败调用或总费用账单。

只读查询：`GET /api/agent/runs/{run_id}/attempts` 与 `GET /api/plans/reviews/{review_id}/attempts`。两者均校验当前用户归属，支持 `after_id` 和 `limit`（默认 50，上限 100），响应含 `items` 和 `next_after_id`；不公开租约 token。

当前固定调用上限为一个 run 最多 32 次模型步骤调用、同一复习题版本最多 3 次评分调用，失败和中断都占次数。结构化调用默认最多修复一次，所有修复共用 `STRUCTURED_AI_TIMEOUT_SECONDS`（默认 180 秒）；SDK 不隐式重试。计划 worker 的 600 秒执行上限与最多 3 次异常尝试仍独立生效。达到调用上限返回 `AGENT_MODEL_BUDGET_EXHAUSTED`，前端提示重新发起任务，不提供无效重试。正常答题等待不占调用次数，已有成功结果的图重放也不会增加模型调用。

RAG 查询明确记录是否尝试 embedding；即使请求失败后降级为关键词，缺失的供应商用量仍计入评测报告的未知调用数。收益是失败与重试成本可追踪；代价是模型调用前后及每次修复增加短事务写入。观测不是供应商账单，未返回用量、终止中的请求和真实计费仍可能存在未知部分。
