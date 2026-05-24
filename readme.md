# SocraticMind — AI 苏格拉底学习平台

<p align="center">
  <img src="https://img.shields.io/badge/Vue.js-3.x-4FC08D?logo=vuedotjs&logoColor=white" alt="Vue.js">
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/FastAPI-0.136-009688?logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/MySQL-8.x-4479A1?logo=mysql&logoColor=white" alt="MySQL">
  <img src="https://img.shields.io/badge/LangChain-0.3-1C3C3C?logo=langchain&logoColor=white" alt="LangChain">
  <img src="https://img.shields.io/badge/License-MIT-lightgrey" alt="License">
</p>

<p align="center">
  <em>通过知识图谱组织学习路径，以苏格拉底对话引导主动思考，完整记录你的每一步成长</em>
</p>

---

## 项目简介

SocraticMind 是一个基于 **Vue 3 + TypeScript + FastAPI + MySQL** 构建的 AI 驱动学习平台。

系统围绕三个核心维度展开：**知识图谱**将学习内容拆解为带依赖关系的结构化节点；**苏格拉底对话**根据当前节点与用户掌握程度动态调整问答策略；**学习追踪**以打卡、连续天数、热力图和成就徽章完整记录学习历程。

前端通过 **Server-Sent Events** 实时接收 AI 流式回复，后端基于 LangChain / LangGraph 编排多轮对话逻辑。

---

## 核心特性

### 知识图谱

- AI 一键生成指定主题的结构化知识图谱
- 节点带父子依赖关系，父节点掌握后自动解锁子节点
- 节点三态管理：锁定 → 可学习 → 已掌握
- 基于 Vue Flow + Dagre 的交互式图谱可视化，支持拖拽与缩放

### 苏格拉底 AI 对话

- **苏格拉底模式**：AI 以启发式提问代替直接告知
- **普通聊天模式**：自由问答，支持任意上下文
- 三种 AI 教学风格：温和 / 标准 / 严格，可在对话中切换
- SSE 流式响应，实时逐字输出 AI 回复
- AI 快捷回复建议，辅助用户进入下一步
- 对话历史持久化，随时回顾学习过程

### 学习统计与成就

- 每日学习打卡，记录学习连续天数
- 年度热力图，记录学习进度
- 周统计与多维度成就徽章系统
- 节点掌握庆祝动效
### 用户系统

- 注册 / 登录，邮箱验证码找回密码
- JWT Bearer Token 鉴权，默认 7 天有效期
- 头像上传（图片文件）或渐变色头像自动生成
- 个人资料编辑：简介、每日目标、AI 教学风格偏好
- 账户注销

### Markdown 笔记

- 富文本 Markdown 编辑器
- 代码块语法高亮
- 对话消息内联 Markdown 渲染
- 深色 / 浅色主题切换

---

## 系统架构

```mermaid
flowchart LR
  Browser[浏览器用户] --> Frontend[Vue 前端\nVite :5173]
  Frontend -->|REST API| Backend[FastAPI 后端\n:8000]
  Frontend <-->|SSE 流式响应| Backend

  Backend --> DB[(MySQL\nsocraticmind)]
  Backend --> AI[AI 服务\nDeepSeek / OpenAI 兼容]

  Backend --> Auth[JWT 鉴权]
  Backend --> LangChain[LangChain / LangGraph\n对话编排]
  LangChain --> AI
```

---

## 技术栈

### 前端 (Frontend)

- **框架**：Vue 3 + TypeScript
- **构建工具**：Vite
- **状态管理**：Pinia
- **路由**：Vue Router 4
- **样式**：Tailwind CSS
- **HTTP**：Axios
- **图谱可视化**：Vue Flow + Dagre
- **Markdown**：marked + highlight.js + md-editor-v3
- **动效**：canvas-confetti

### 后端 (Backend)

- **框架**：FastAPI
- **服务器**：Uvicorn
- **ORM**：SQLAlchemy 2
- **数据校验**：Pydantic v2 Settings
- **AI 编排**：LangChain + LangGraph
- **AI 调用**：OpenAI SDK（兼容 DeepSeek 等）
- **认证**：JWT (python-jose) + Passlib
- **实时通信**：Server-Sent Events
- **数据库驱动**：PyMySQL

### 数据与工具

- **数据库**：MySQL 8.x
- **包管理**：pnpm（前端）、pip（后端）
- **API 文档**：Swagger / OpenAPI（`/docs`）

---

## 快速启动

### 环境要求

- Node.js 18+
- pnpm
- Python 3.10+
- MySQL 8.x
- DeepSeek API Key，或任何兼容 OpenAI Chat Completions 接口的服务
- SMTP 邮件服务（可选，用于发送验证码）

### 安装步骤

#### 1. 克隆仓库

```bash
git clone https://github.com/gmaicoson-crypto/SocraticMind.git
cd SocraticMind
```

#### 2. 初始化数据库

在 MySQL 中手动创建数据库（表结构由后端首次启动时自动生成）：

```sql
CREATE DATABASE socraticmind CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

#### 3. 配置并启动后端

```bash
cd backend
python -m venv .venv

# Windows PowerShell
.\.venv\Scripts\Activate.ps1
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
copy .env.example .env   # Windows
cp .env.example .env     # macOS / Linux
```

编辑 `backend/.env`，至少配置以下必填项（建议配置所有选项）：

```env
DEEPSEEK_API_KEY=your_api_key_here
SECRET_KEY=your_random_secret_string_here
DATABASE_URL=mysql+pymysql://root:your_password@localhost:3306/socraticmind
```

启动后端：

```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

#### 4. 配置并启动前端

```bash
cd frontend
pnpm install
pnpm dev
```

如需修改后端地址，编辑 `frontend/.env`：

```env
VITE_API_BASE=http://127.0.0.1:8000
```

#### 5. 访问应用

| 服务 | 地址 |
| --- | --- |
| 前端应用 | <http://localhost:5173> |
| 后端 API 文档 | <http://127.0.0.1:8000/docs> |

---

## 环境变量说明

### 后端 `backend/.env`

| 变量 | 必填 | 说明 | 默认值 |
|------|:----:|------|--------|
| `DEEPSEEK_API_KEY` | 是 | AI 服务 API Key | — |
| `DEEPSEEK_BASE_URL` | 否 | OpenAI 兼容 API 地址 | `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | 否 | 模型名称 | `deepseek-chat` |
| `SECRET_KEY` | 是 | JWT 签名密钥（建议 32 位以上随机字符串） | — |
| `DATABASE_URL` | 是 | SQLAlchemy 连接串 | `mysql+pymysql://root@localhost:3306/socraticmind` |
| `CORS_ORIGINS` | 否 | 允许的前端来源（逗号分隔） | `http://localhost:5173` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 否 | Token 有效期（分钟） | `10080`（7 天） |
| `SMTP_HOST` | 否 | SMTP 服务器地址 | — |
| `SMTP_PORT` | 否 | SMTP 端口 | `587` |
| `SMTP_USER` | 否 | SMTP 用户名 | — |
| `SMTP_PASSWORD` | 否 | SMTP 密码或授权码 | — |
| `SMTP_FROM` | 否 | 发件人地址 | — |
| `SMTP_USE_TLS` | 否 | 是否启用 TLS | `true` |
| `APP_NAME` | 否 | 邮件中显示的应用名称 | `SocraticMind` |

> 不配置 SMTP 变量时，邮箱验证功能不可用，其余功能正常运行。

### 前端 `frontend/.env`

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `VITE_API_BASE` | 后端 API 基础地址 | `http://127.0.0.1:8000` |

---

## 功能演示

### AI 对话流程

```text
用户选择知识节点
   ↓
前端携带节点信息与历史对话发起请求
   ↓
后端 LangChain 编排 → 调用 AI 服务
   ↓
SSE 流式返回，前端实时逐字渲染回复
   ↓
AI 检测到掌握信号 → 自动解锁后续依赖节点
```

### 节点状态流转

```text
locked（锁定）
   └─── 父节点全部掌握 ───→ available（可学习）
                                 └─── 用户标记掌握 ───→ mastered（已掌握）
                                                              └─── 触发庆祝动效
                                                              └─── 解锁子节点
```

### 学习统计流程

```text
用户完成对话或标记节点掌握
   ↓
后端记录学习打卡（LearningRecord）
   ↓
更新连续学习天数（Streak）
   ↓
前端热力图 / 周统计 / 成就徽章实时反映进度
```

---

## 项目结构

```text
SocraticMind/
├── backend/
│   ├── ai/
│   │   ├── prompts/            # Prompt 模板（Markdown 文件）
│   │   ├── agent.py            # 苏格拉底对话 AI 逻辑
│   │   ├── graph_generator.py  # 知识图谱 AI 生成
│   │   └── prompts.py          # Prompt 加载工具
│   ├── core/
│   │   ├── ai_client.py        # OpenAI 兼容 API 客户端
│   │   ├── auth.py             # JWT / OAuth2 鉴权
│   │   ├── config.py           # 配置管理（Pydantic Settings）
│   │   ├── database.py         # 数据库引擎与会话
│   │   ├── deps.py             # 依赖注入
│   │   ├── email.py            # SMTP 邮件发送
│   │   ├── rate_limit.py       # 接口限流
│   │   └── templates/          # 邮件 HTML 模板
│   ├── models/
│   │   ├── user.py             # 用户表
│   │   ├── topic.py            # 学习主题表
│   │   ├── node.py             # 知识节点表
│   │   ├── progress.py         # 学习记录表
│   │   └── email_code.py       # 邮箱验证码表
│   ├── routers/
│   │   ├── auth.py             # 认证、资料、头像、账户管理
│   │   ├── topics.py           # 主题 CRUD、AI 生成、推荐
│   │   ├── nodes.py            # 节点管理、掌握状态
│   │   ├── chat.py             # AI 流式对话、历史消息
│   │   └── progress.py         # 打卡、连续天数、统计
│   ├── uploads/avatars/        # 用户头像文件存储
│   ├── main.py                 # 应用入口
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── api/                # Axios 接口封装
│   │   ├── components/         # 公共 Vue 组件
│   │   │   └── dialogue/       # 对话界面子组件
│   │   ├── views/              # 页面级组件
│   │   │   └── profile/        # 个人资料子页面
│   │   ├── stores/             # Pinia 状态管理
│   │   ├── router/             # Vue Router 配置
│   │   ├── types/              # TypeScript 类型定义
│   │   └── utils/              # 工具函数
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
│
├── LICENSE
└── README.md
```

---

## API 模块

| 前缀 | 功能 |
| --- | --- |
| `/api/auth` | 注册、登录、邮箱验证码、找回密码、资料编辑、头像上传、账户注销 |
| `/api/topics` | 主题列表、AI 生成主题、主题推荐、主题删除 |
| `/api/nodes` | 节点列表、节点搜索、创建节点、标记掌握 |
| `/api/chat` | SSE 流式对话、历史消息、快捷建议、消息删除 |
| `/api/progress` | 每日打卡、连续天数、热力图数据、周统计 |

完整接口文档在后端启动后访问：`http://127.0.0.1:8000/docs`

---



## 许可证

本项目采用 [MIT License](LICENSE) 开源许可。

---

## 致谢

- 感谢 [Vue.js](https://vuejs.org/) 社区提供优秀的前端框架
- 感谢 [FastAPI](https://fastapi.tiangolo.com/) 带来高效的 Python Web 开发体验
- 感谢 [Vue Flow](https://vueflow.dev/) 提供强大的图谱可视化能力
- 感谢 [LangChain](https://langchain.com/) 简化 AI 编排与多轮对话实现
- 感谢所有开源项目与学习资料对本项目的启发

---

如果这个项目对你有帮助，欢迎 Star 支持！

2026 © [gmaicoson-crypto](https://github.com/gmaicoson-crypto)
