# SocraticMind Frontend

SocraticMind 前端是基于 Vue 3、TypeScript、Vite 和 Pinia 构建的学习应用界面。它负责用户登录注册、知识图谱展示、苏格拉底式对话、普通聊天、学习进度统计、个人资料和账户设置等交互。

## 技术栈

- Vue 3 + TypeScript
- Vite
- Vue Router
- Pinia
- Tailwind CSS
- Axios
- Vue Flow + Dagre
- marked + highlight.js
- md-editor-v3

## 环境要求

- Node.js 18 或更高版本
- pnpm
- 后端服务默认运行在 `http://127.0.0.1:8000`

## 快速启动

进入前端目录：

```bash
cd frontend
```

安装依赖：

```bash
pnpm install
```

创建或检查本地环境变量文件 `.env`：

```env
VITE_API_BASE=http://127.0.0.1:8000
```

启动开发服务器：

```bash
pnpm dev
```

默认访问地址：

```text
http://localhost:5173
```

## 常用脚本

```bash
pnpm dev
```

启动 Vite 开发服务器。

```bash
pnpm build
```

先执行 TypeScript 类型检查，再生成生产构建产物到 `dist/`。

```bash
pnpm preview
```

本地预览生产构建结果。

## 环境变量

| 变量 | 说明 | 示例 |
| --- | --- | --- |
| `VITE_API_BASE` | 后端 API 基础地址 | `http://127.0.0.1:8000` |

修改后需要重启 Vite 开发服务器。

## 主要功能

- 用户注册、登录、找回密码、修改密码和注销账户
- JWT 登录态保存和请求拦截
- 主题列表和 AI 推荐主题
- AI 生成学习主题的知识图谱
- 知识节点搜索、查看、解锁和掌握状态更新
- 苏格拉底式对话和普通聊天模式
- SSE 流式接收 AI 回复
- Markdown 编辑、渲染和代码高亮
- 学习打卡、连续学习天数、热力图和周统计
- 个人资料、头像上传、头像渐变和每日目标设置
- 深色和浅色主题切换

## 目录结构

```text
frontend/
├── public/                 # 静态资源
├── src/
│   ├── api/                # 后端接口封装
│   ├── assets/             # 前端资源
│   ├── components/         # 通用组件
│   │   └── dialogue/       # 对话区相关组件
│   ├── router/             # Vue Router 路由配置
│   ├── stores/             # Pinia 状态管理
│   ├── types/              # TypeScript 类型定义
│   ├── utils/              # 工具函数
│   ├── views/              # 页面视图
│   ├── App.vue             # 应用根组件
│   ├── main.ts             # 应用入口
│   └── style.css           # 全局样式
├── index.html
├── package.json
├── pnpm-lock.yaml
├── tailwind.config.js
├── postcss.config.js
├── tsconfig*.json
└── vite.config.ts
```

## 路由

| 路径 | 页面 | 说明 |
| --- | --- | --- |
| `/login` | `Login.vue` | 登录、注册、找回密码 |
| `/` | `Home.vue` | 主学习界面，需要登录 |
| `/profile` | `Profile.vue` | 个人中心，需要登录 |

需要登录的页面会通过路由守卫检查本地 token。未登录访问会跳转到 `/login`，已登录访问 `/login` 会跳转到首页。

## 接口约定

前端通过 `src/api/index.ts` 创建 Axios 实例，统一使用 `VITE_API_BASE` 作为基础地址。请求会自动带上本地保存的 Bearer Token：

```http
Authorization: Bearer <token>
```

当后端返回 `401` 时，前端会清除本地登录态并跳转到 `/login`。

聊天接口使用 `fetch` 调用 `/api/chat/stream`，通过 `text/event-stream` 接收后端流式返回的数据。

## 构建产物

生产构建输出目录为：

```text
frontend/dist/
```

部署时需要让静态站点服务指向该目录，并确保 `VITE_API_BASE` 指向真实后端地址。

## 开发提示

- 修改 `.env` 后需要重启开发服务器。
- 前端依赖后端认证、主题、节点、聊天和进度接口，联调时请先启动后端服务。
- 当前 `package.json` 未配置单独的测试脚本；提交前建议至少运行 `pnpm build` 检查类型和构建。
