# SocraticMind Backend

SocraticMind 后端是基于 FastAPI、SQLAlchemy 和 DeepSeek/OpenAI 兼容接口构建的 API 服务。它负责用户认证、邮箱验证码、知识主题和节点管理、AI 对话、AI 生成知识图谱、学习进度统计以及头像静态文件服务。

## 技术栈

- Python
- FastAPI
- Uvicorn
- SQLAlchemy
- Pydantic Settings
- JWT + OAuth2 Password Flow
- Passlib
- LangChain / LangGraph
- OpenAI Python SDK 兼容调用
- MySQL 或其他 SQLAlchemy 支持的数据库

## 环境要求

- Python 3.10 或更高版本
- 可访问的 MySQL 数据库
- DeepSeek API Key，或其他兼容 OpenAI Chat Completions 的服务
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
DEEPSEEK_API_KEY=your_api_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

SECRET_KEY=change_me_to_a_random_secret_string

DATABASE_URL=mysql+pymysql://root:your_password@localhost:3306/socraticmind
CORS_ORIGINS=http://localhost:5173
```

启动服务：

```bash
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
| `DEEPSEEK_API_KEY` | 是 | AI 服务 API Key | `sk-...` |
| `DEEPSEEK_BASE_URL` | 否 | OpenAI 兼容 API 地址 | `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | 否 | 聊天模型名称 | `deepseek-chat` |
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

后端启动时会执行：

```python
Base.metadata.create_all(bind=engine)
```

也就是说，模型对应的数据表会在服务启动时自动创建。你仍然需要提前创建数据库本身，例如 MySQL 中的 `socraticmind` 数据库。

当前主要数据模型包括：

- `User`：用户账号、密码哈希、头像、个人偏好
- `Topic`：学习主题
- `Node`：知识图谱节点
- `ChatMessage`：用户和 AI 的对话记录
- `LearningRecord`：学习打卡记录
- `EmailCode`：邮箱验证码

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
- 当前仓库未配置后端测试脚本；接口改动后建议先访问 `/docs` 做基本联调，再与前端一起验证主流程。
