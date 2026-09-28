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
    "id": "deepseek",
    "name": "DeepSeek",
    "api_key": "your_deepseek_key",
    "base_url": "https://api.deepseek.com/v1",
    "model": "deepseek-chat"
  },
  {
    "id": "openai",
    "name": "OpenAI",
    "api_key": "your_openai_key",
    "base_url": "https://api.openai.com/v1",
    "model": "gpt-4o-mini"
  }
]
LLM_DEFAULT_MODEL_ID=deepseek

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
| `LLM_MODELS` | 与旧配置二选一 | 多个 OpenAI 兼容服务的 JSON 数组，包含 `id`、`name`、`api_key`、`base_url`、`model` | 见 `.env.example` |
| `LLM_DEFAULT_MODEL_ID` | 否 | 默认 profile 的 `id`；未设置时使用数组第一项 | `deepseek` |
| `LLM_API_KEY` | 与 `LLM_MODELS` 二选一 | 兼容旧版的单模型 API Key | 服务商提供的密钥 |
| `LLM_BASE_URL` | 与 `LLM_MODELS` 二选一 | 兼容旧版的 OpenAI 兼容 API 地址 | 服务商提供的地址 |
| `LLM_MODEL` | 与 `LLM_MODELS` 二选一 | 兼容旧版的模型 ID | 服务商提供的模型 ID |
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

- `ai/agent.py`：根据当前节点、用户输入、历史消息和模式生成流式回复
- `ai/graph_generator.py`：为新主题生成知识节点和依赖关系
- `routers/topics.py`：推荐学习主题
- `routers/chat.py`：生成快捷回复建议

提示词文件位于：

```text
backend/ai/prompts/
```

主要支持苏格拉底式引导、普通聊天、主题概览、节点概览、掌握判断和主题推荐。

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
