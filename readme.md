# SocraticMind - AI驱动的苏格拉底式学习平台

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.8%2B-blue?logo=python" alt="Python Version">
  <img src="https://img.shields.io/badge/Vue.js-3.x-green?logo=vuedotjs" alt="Vue.js Version">
  <img src="https://img.shields.io/badge/FastAPI-latest-orange?logo=fastapi" alt="FastAPI">
  <img src="https://img.shields.io/github/license/gmaicoson@gamil.com/SocraticMind" alt="License">
  <img src="https://img.shields.io/badge/SQLite-Lightweight-brightgreen" alt="Database">
</p>

<p align="center">
  <em>通过AI引导的苏格拉底式对话，让学习变得更深入、更有趣</em>
</p>

## 🌟 项目简介

SocraticMind是一个创新的AI教育平台，结合了**苏格拉底式教学法**与现代人工智能技术。平台通过智能对话引导用户主动思考、探索知识，而不是被动接受信息。系统能够自动检测用户的掌握状态，并提供个性化的学习路径。

我们的目标是创造一个能够真正理解学习过程、激发好奇心、培养批判性思维的智能学习伙伴。

## 🚀 核心特性

### 🔍 智能教学模式
- **双模式对话**：支持苏格拉底引导模式与普通聊天模式自由切换
- **掌握状态检测**：通过`[MASTERED]`信号自动识别知识点掌握情况
- **个性化引导**：根据用户回答动态调整问题难度和方向

### 📊 知识图谱可视化
- **交互式图谱**：原生SVG实现的知识节点关系可视化
- **智能布局算法**：自动分配节点坐标，实现合理排布
- **状态颜色编码**：不同掌握状态用不同颜色标识
- **依赖关系展示**：清晰显示知识点间的前置后置关系

### 💡 用户体验创新
- **三栏可拖拽布局**：灵活调整学习界面布局
- **面板一键切换**：快速在不同功能模块间切换
- **学习热力图**：可视化学习活跃度和进度
- **头像渐变奖励**：基于学习成就的视觉反馈机制

### 🛠️ 技术亮点
- **轻量级架构**：SQLite单文件数据库，零配置部署
- **安全认证**：JWT Token认证 + Bcrypt密码哈希
- **响应式设计**：适配桌面和移动设备
- **实时渲染**：Markdown语法高亮与实时预览

## 🏗️ 技术栈

### 后端 (Backend)
- **框架**: FastAPI (Python 3.8+)
- **数据库**: SQLite (支持自动迁移)
- **AI集成**: 多模型支持，内置fallback机制
- **认证**: JWT + OAuth2
- **安全**: CORS配置、输入验证、防注入保护

### 前端 (Frontend)
- **框架**: Vue 3 + TypeScript
- **状态管理**: Pinia
- **路由**: Vue Router
- **样式**: Tailwind CSS + 自定义CSS变量
- **构建工具**: Vite + pnpm

### 开发工具
- **包管理**: pnpm
- **代码格式化**: Prettier
- **类型检查**: TypeScript
- **测试**: 单元测试 + E2E测试框架

## 🚦 快速开始

### 环境要求
- Node.js v16+
- Python 3.8+
- pnpm (推荐) 或 npm

### 安装步骤

1. **克隆仓库**
   ```bash
   git clone https://github.com/gmaicoson-crypto/SocraticMind.git
   cd SocraticMind
   ```

2. **安装前端依赖**
   ```bash
   cd frontend
   pnpm install
   # 或者使用 npm
   # npm install
   ```

3. **安装后端依赖**
   ```bash
   cd ../backend
   pip install -r requirements.txt
   # 或者使用虚拟环境
   python -m venv venv
   source venv/bin/activate  # Linux/Mac
   # venv\Scripts\activate  # Windows
   pip install -r requirements.txt
   ```

4. **启动开发服务器**

   **前端开发服务器**:
   ```bash
   # 在 frontend 目录下
   pnpm dev
   ```

   **后端开发服务器**:
   ```bash
   # 在 backend 目录下
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

5. **访问应用**
   - 前端: http://localhost:5173
   - API文档: http://localhost:8000/docs

### 生产部署

```bash
# 构建前端
cd frontend
pnpm build

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件配置生产环境参数

# 启动生产服务器
cd ../backend
uvicorn main:app --host 0.0.0.0 --port 8000
```

## 🧪 功能演示

### 苏格拉底对话示例
```
AI: 让我们探讨一下机器学习的概念。你认为什么是机器学习？
用户: 机器学习就是让计算机从数据中学习规律。
AI: 很好！那么你能举一个具体的例子吗？比如在什么场景下会用到机器学习？
用户: [提供例子...]
AI: [MASTERED] 看来你已经掌握了这个概念！接下来我们来看看监督学习...
```

### 知识图谱特点
- 节点颜色：🟢 掌握 / 🟡 学习中 / 🔴 未开始
- 连线粗细：表示知识点重要程度
- 拖拽交互：自由调整图谱布局
- 实时更新：学习进度自动同步到图谱

## 📁 项目结构

```
SocraticMind/
├── backend/                 # 后端服务
│   ├── ai/                  # AI核心逻辑
│   │   ├── agent.py         # 对话代理
│   │   ├── graph_generator.py # 知识图谱生成
│   │   └── prompts.py       # 提示词模板
│   ├── core/                # 核心功能
│   │   ├── auth.py          # 认证系统
│   │   ├── database.py      # 数据库连接
│   │   └── config.py        # 配置管理
│   ├── models/              # 数据模型
│   ├── routers/             # API路由
│   └── main.py              # 应用入口
│
├── frontend/                # 前端应用
│   ├── src/
│   │   ├── api/             # API调用封装
│   │   ├── components/      # Vue组件
│   │   │   ├── dialogue/    # 对话相关组件
│   │   │   ├── KnowledgeGraph.vue # 知识图谱组件
│   │   │   └── InlineMarkdown.vue # Markdown渲染
│   │   ├── stores/          # 状态管理
│   │   ├── utils/           # 工具函数
│   │   └── views/           # 页面视图
│   └── vite.config.ts       # 构建配置
│
└── readme.md                # 项目文档
```

## 🤝 贡献指南

我们欢迎任何形式的贡献！以下是参与项目的方式：

### 1. 报告问题
- 在 [Issues](https://github.com/gmaicoson-crypto/SocraticMind/issues) 中创建新问题
- 提供详细的复现步骤和环境信息

### 2. 提交代码
1. Fork 本仓库
2. 创建您的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交您的更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

### 3. 代码规范
- **Python**: 遵循 PEP 8 规范
- **TypeScript**: 使用严格类型检查
- **提交信息**: 遵循 conventional commits 规范
- **测试**: 新功能需要包含相应的测试用例

### 4. 开发流程
```bash
# 运行测试
cd backend
pytest

cd ../frontend  
pnpm test

# 代码格式化
pnpm format
```

## 📜 许可证

本项目采用 [MIT License](LICENSE) 开源许可。

```
MIT License

Copyright (c) 2026 Your Name

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 🙏 致谢

- 感谢 [FastAPI](https://fastapi.tiangolo.com/) 团队提供的优秀框架
- 感谢 [Vue.js](https://vuejs.org/) 社区的持续创新
- 感谢所有开源项目的贡献者，特别是 [marked.js](https://marked.js.org/) 和 [highlight.js](https://highlightjs.org/)
- 特别感谢早期测试用户的宝贵反馈

## 📬 联系方式

- **项目主页**: [https://github.com/gmaicoson-crypto/SocraticMind](https://github.com/gmaicoson-crypto/SocraticMind)
- **问题反馈**: [Issues](https://github.com/gmaicoson-crypto/SocraticMind/issues)
- **邮件**: gmaicoson@gamil.com

---

<p align="center">
  <em>让AI成为你的苏格拉底导师，开启深度学习之旅！</em>
</p>