# 项目开发约定

1. 每次修改代码后，必须在结束任务或提交前执行代码格式校验：在仓库根目录运行 `node scripts/format.mjs --check`，或运行 `pnpm --dir frontend format:check`。检查失败时，运行 `node scripts/format.mjs --write` 修复，审查格式变更后重新校验，直到通过。缺少依赖时先安装；无法执行时必须说明原因，不得声称校验通过。

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
