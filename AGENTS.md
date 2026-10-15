# 项目开发约定

1. 每次修改代码后，必须在结束任务或提交前执行代码格式校验：在仓库根目录运行 `node scripts/format.mjs --check`，或运行 `pnpm --dir frontend format:check`。检查失败时，运行 `node scripts/format.mjs --write` 修复，审查格式变更后重新校验，直到通过。缺少依赖时先安装；无法执行时必须说明原因，不得声称校验通过。
2. 新增或修改板块的时间展示时，必须遵循下文“时间展示约定”，统一复用 `TimeDisplay`，不得在业务组件中另写时间格式化逻辑。

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
