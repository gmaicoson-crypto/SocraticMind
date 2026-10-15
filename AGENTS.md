# 项目开发约定

1. 每次修改代码后，必须在结束任务或提交前执行代码格式校验：在仓库根目录运行 `node scripts/format.mjs --check`，或运行 `pnpm --dir frontend format:check`。检查失败时，运行 `node scripts/format.mjs --write` 修复，审查格式变更后重新校验，直到通过。缺少依赖时先安装；无法执行时必须说明原因，不得声称校验通过。
2. 新增或修改板块的时间展示时，必须遵循下文“时间展示约定”，统一复用 `TimeDisplay`，不得在业务组件中另写时间格式化逻辑。
3. 每批代码修改后，必须执行行数检查 `node scripts/check-lines.mjs`，并对修改部分及相关部分做定向测试，再执行格式校验；不以构建或全量测试代替定向测试。APK 仅在用户明确要求时构建。

## 代码行数与大模块拆分

| 文件类型                         | 提醒阈值 | 硬上限 | 建议目标       |
| -------------------------------- | -------- | ------ | -------------- |
| Vue、TS/JS、Python、其他代码及样式 | 400 行   | 600 行 | 200～400 行    |
| 测试文件                         | 600 行   | 800 行 | 按行为场景组织 |

- 按格式化后的物理行数统计，包含空行、注释；Vue 包含模板、脚本和样式。排除依赖、构建产物、明确标识的生成文件、锁文件及数据库版本迁移；普通配置数据不计入代码行数。
- 本地增量检查：`node scripts/check-lines.mjs`；全仓检查：`node scripts/check-lines.mjs --all`；CI 比较：`node scripts/check-lines.mjs --base=<ref>`。前端可用 `pnpm --dir frontend size:check` 或 `size:check:all`。
- 历史超限文件登记在 `.code-size-baseline.json`，必须注明原因，禁止新增豁免或提高已有上限。文件缩减后同步下调基线；达到硬上限后移除豁免；删除或重命名不能保留旧豁免或产生新豁免。
- 修改前先检查现有组件、composable、工具和服务能否复用。按业务职责和状态归属拆分，不为满足行数压缩代码、挪走样式、创建无职责的碎片文件，或把大模块整体搬入另一个大文件。
- 页面和容器负责组合；展示组件通过明确的 props/emits 交互；业务流程与纯计算分开。共享状态明确唯一所有者，避免循环依赖、重复状态及过大的参数集合。
- 后端拆分保留 API、事件、事务、锁、幂等与取消语义；事务提交与回滚由清晰的业务边界统一管理。前端拆分避免增加深度监听、重复请求或每帧响应式开销，统一释放监听器、定时器和渲染资源。
- 后端入口、导入或迁移变更须验证 `main:app` 在独立进程中的真实启动与关闭，测试数据库和附件目录必须隔离。保留已应用迁移的 revision 与祖先链；切换分支导致版本不匹配时先核对迁移历史，不通过改写数据库版本号绕过检查。
- 聊天流式状态由 `useDialogueState` 唯一持有并统一清理。恢复和节点发送监听必须在会话导航重置完成后执行，异步回调用请求 ID、会话和 epoch 校验归属；取消确认只清理对应请求的恢复记录，卸载后不得继续轮询或启动延迟发送。
- 现有模块按聊天前端、聊天后端及生命周期、图谱、Agent、表单与公共样式逐批拆分；每批独立验证原有行为和性能相关边界。文件达标后仍需检查职责完整性和复用程度。

大模块的职责入口如下，新增功能优先扩展对应模块，保持入口组件和路由只做组合：

| 板块 | 职责与复用入口 |
| --- | --- |
| 聊天前端 | `SocraticDialogue.vue` 组合界面；`composables/dialogue/` 分别管理状态、学习流程、会话导航与编辑、消息操作、发送、流式执行和恢复，继续复用现有会话、标题、历史、评估与引导 composable。 |
| 聊天后端 | `routers/chat.py` 保留 HTTP 协议；`schemas/chat.py` 管理请求响应；`services/chat_streaming/` 管理准备、事件和执行；`services/chat_turns/` 管理事务与生命周期，通过 `chat_lifecycle.py` 保留公共入口。 |
| Agent | `orchestrator.py` 协调流程；`run_store.py` 提供共享快照、归属及并发持久化；`plan_generation.py` 生成诊断和计划预览；`plan_confirmation.py` 原子确认落库。评估复用运行存储，不依赖计划编排的内部实现。 |
| 图谱 | `ThreeGraphCanvas.vue` 组合并管理渲染生命周期；`createGraphLayout` 复用 `graphFit`；`createGraphObjects` 管理几何对象与释放；`createGraphInteractions` 管理手势；主题材质逻辑集中在 `graphAppearance`。 |
| 表单与输入 | 认证复用 `AuthenticationForm` 和 `useAuthForm`；资料编辑复用 `ProfileAvatarEditor`、`ProfilePasswordSection` 与 `profileControls.css`；建议测量和观察器由 `DialogueSuggestions` 管理。 |
| 联网搜索与样式 | `web_search.py` 协调流程，提供方、URL 校验和容量管理分别放在对应模块；`source_snapshots.py` 为联网证据与附件提供共享来源快照校验，避免互相引用；`common.css` 按原有层叠顺序汇总 `base.css`、`controls.css`、`markdown.css`、`messages.css`。 |

## 格式工具与命令

- Prettier：Vue、TS/TSX、JS/JSX、CSS/SCSS/Less、HTML、JSON、YAML；规则见 `.prettierrc.json`。
- Ruff Formatter：Python；规则见 `pyproject.toml`。
- `.editorconfig` 为编辑器统一缩进和换行：前端 2 空格、Python 4 空格、LF 换行。
- 默认只处理相对 `HEAD` 的已暂存、未暂存及未被 Git 忽略的新增代码文件，跳过删除文件、依赖、构建产物和前端锁文件。一次按工具批量执行，避免逐文件启动开销。
- 全仓库检查仅在需要时运行 `node scripts/format.mjs --check --all`，或 `pnpm --dir frontend format:check:all`。历史代码可能尚未符合规则，日常修改采用增量检查。
- 格式检查用于统一排版；功能变更仍需对修改部分及相关部分执行定向测试。

首次安装开发工具，在仓库根目录执行：

```bash
pnpm --dir frontend install
python3 -m venv backend/.venv  # 已有虚拟环境时跳过
backend/.venv/bin/python -m pip install -r backend/requirements-dev.txt
```

Windows 使用 `python -m venv backend/.venv` 创建环境，并使用 `backend/.venv/Scripts/python.exe -m pip install -r backend/requirements-dev.txt` 安装 Python 格式工具。

日常命令（均在仓库根目录执行，覆盖前后端）：

```bash
node scripts/format.mjs --check
node scripts/format.mjs --write
```

也可使用前端 package scripts 的统一入口：

```bash
pnpm --dir frontend format:check
pnpm --dir frontend format:fix
```

## 时间展示约定

聊天、会话历史、评估历史、Agent 记忆、联网来源、个人最近记录、计划和复习等板块，统一使用 [TimeDisplay](frontend/src/components/ui/TimeDisplay.vue)。直接传入原始时间戳或日期，不要先在调用处格式化：

```vue
<TimeDisplay :value="item.created_at" />
```

时间戳按浏览器本地时区判断“今天”和年份，沿用聊天消息的展示规则：

| 时间范围     | 展示格式                       | 示例         |
| ------------ | ------------------------------ | ------------ |
| 今天         | `HH:mm`，24 小时制，精确到分钟 | `09:05`      |
| 今年其他日期 | `MM/DD`                        | `09/07`      |
| 其他年份     | `YYYY/MM/DD`                   | `2025/12/31` |

- `TimeDisplay` 保留原始值到 `datetime` 属性，悬停提示显示完整的本地日期和时分；纯日期的提示只显示完整日期。
- 只有日期的值（如 `YYYY-MM-DD`）按日历日期处理：今年显示 `MM/DD`，其他年份显示 `YYYY/MM/DD`。即使是今天，也不补造 `00:00`，不经过 UTC 转换导致日期偏移。仅有年或月的信息保留原有精度；空值显示 `—`，无法解析的值保留原文。
- 学习时长、倒计时、时段、日历刻度和原生日期输入框按各自含义展示，不套用事件时间戳规则。
- 公共解析和格式化逻辑集中在 [frontend/src/utils/chat.ts](frontend/src/utils/chat.ts) 的 `parseSessionDate`、`formatMessageTime`、`formatSessionTime` 和 `formatFullTime`。需要调整规则时修改公共实现及其定向测试，不得在板块内另写 `new Date` 格式拼接、`toLocaleString`、`toLocaleDateString` 或 `Intl.DateTimeFormat` 等展示逻辑。日期计算和获取浏览器时区不受此限制。
- 接口应提供包含年份的原始时间戳，并保留已知时区和时间精度，避免仅返回月日或已格式化的展示文本；未知时区不得自行猜测。
- 修改公共时间规则时，定向验证今天、同年、跨年、时区换算、纯日期和旧格式兼容；相关测试见 `frontend/src/utils/__tests__/chat.spec.ts` 与 `frontend/src/components/ui/__tests__/TimeDisplay.spec.ts`。
