# P0 Learning Agent 迁移与验收报告

> 警告：不要对结构未知的已有数据库执行 `alembic stamp`。先备份、核对旧结构，并在隔离库完成恢复与升级演练。应用不会自动建表，数据库 revision 未到 head 时会拒绝启动。

## 交付结论

P0 Learning Agent 已覆盖新主题 onboarding、可选诊断、计划预览与确认、已有主题补计划、今日计划与重新规划、正式评估、自报/撤销掌握、学习记忆 CRUD 和服务端对话上下文。ACC-01 至 ACC-13 均有自动化验证，关键界面另做真实浏览器桌面与窄屏复查。

后端模型调用采用 60 秒超时、一次结构修复和可重试错误协议；模型调用不在数据库事务中执行。最近对话限定 10 条，学习记忆限定 20 条和 3000 字符，单条记忆限定 300 字符。

## 迁移演练

演练环境为 MySQL 8.4.11 的独立脱敏数据库 `socraticmind_p0_rehearsal_codex`，未操作开发库或生产库。样本包含一个用户、一个主题、一个已掌握节点和一条聊天消息。

| 检查项 | 升级前 | 升级后 |
| --- | ---: | ---: |
| `users` | 1 | 1 |
| `topics` | 1 | 1 |
| `nodes` | 1 | 1 |
| `chat_messages` | 1 | 1 |

演练步骤为：生成脱敏备份、移除版本表模拟历史库、确认基线结构、stamp `0001_current_schema_baseline`、upgrade 到 `0003_p0_query_indexes`、复核计数和兼容回填。结果为四类旧数据计数不变，旧 mastered 节点回填 `mastery_source=legacy`，旧消息回填 `message_type=chat`，最近对话复合索引存在。

脱敏备份位于 `/tmp/socraticmind_p0_rehearsal_20260907.sql`，不进入 Git。该文件只用于本次本机演练，`/tmp` 不是长期备份位置。

### 空库部署

```bash
cd backend
alembic upgrade head
uvicorn main:app --host 127.0.0.1 --port 8000
```

### 已有库升级

1. 停止写入并创建可恢复备份。
2. 在隔离库恢复备份，核对旧表结构与 `0001_current_schema_baseline` 一致。
3. 记录 `users`、`topics`、`nodes`、`chat_messages` 等关键表计数。
4. 在确认无 Alembic 版本表的旧库执行 `alembic stamp 0001_current_schema_baseline`。
5. 执行 `alembic upgrade head`，核对 `alembic current`、关键表计数和回填字段。
6. 启动 API 并请求 `/health`；之后再开放业务流量。

### 故障恢复

升级或启动校验失败时先停止 API，不继续写入。首选做法是新建空数据库并恢复升级前备份，验证计数后切换连接；`alembic downgrade 0001_current_schema_baseline` 会删除 P0 表和字段，只能在另有完整备份、明确接受丢弃 P0 新数据时使用。不要通过手工改 `alembic_version` 绕过启动守卫。

## ACC 验收

| 编号 | 状态 | 自动化证据 |
| --- | --- | --- |
| ACC-01 | 通过 | `test_agent_orchestrator.py`：完成诊断并确认后原子创建主题、图谱、计划与记忆 |
| ACC-02 | 通过 | `test_agent_orchestrator.py`：跳过诊断仍生成预览，且无诊断评分 |
| ACC-03 | 通过 | `test_cross_domain_fixtures.py`：教育、医疗、法律、金融、艺术、生活技能、技术固定 mock |
| ACC-04 | 通过 | `test_agent_api.py` 与前端 Agent specs：按 run、step、version 恢复第二题 |
| ACC-05 | 通过 | `test_agent_orchestrator.py`：取消预览不创建正式业务数据 |
| ACC-06 | 通过 | `test_agent_permissions.py`：已有图谱补计划前后节点数量、关系和状态不变 |
| ACC-07 | 通过 | `test_planning.py`、`test_plans_api.py`：保留完成项并从当天重排剩余项 |
| ACC-08 | 通过 | `test_assessment_service.py`：高分、无关键误解且高置信度时自动掌握 |
| ACC-09 | 通过 | `test_assessment_service.py`：关键误解或低置信度阻止自动掌握并返回原因 |
| ACC-10 | 通过 | `test_mastery_service.py`：自报掌握不伪造评估分数 |
| ACC-11 | 通过 | `test_mastery_service.py`：撤销后按全部父节点条件重算后代 |
| ACC-12 | 通过 | `test_memories_service.py`、`test_chat_context.py`：编辑/删除即时影响下次上下文 |
| ACC-13 | 通过 | `test_agent_permissions.py`、`test_memories_api.py`：跨用户读取和写入不泄漏资源 |

## 性能与安全检查

| 检查 | 结果 |
| --- | --- |
| 今日计划 N+1 | 单次联表读取，测试预算不超过 2 次 SELECT |
| 节点与最新评估 N+1 | 批量子查询和 eager load，测试预算不超过 3 次 SELECT |
| 高频索引 | 计划、评估、记忆、掌握事件和最近对话均有匹配复合索引 |
| 模型超时与重试 | 60 秒超时；超时、429、5xx 为可重试；结构修复最多一次 |
| 日志脱敏 | 定向测试确认不记录完整 prompt、用户答案或 provider payload |
| 上下文边界 | 服务端最近 10 条完整聊天；最多 20 条、3000 字符学习记忆 |
| 权限边界 | 所有 P0 资源从 JWT 用户归属查询，跨用户返回 403 或 404 |

## 验证命令

```bash
cd backend
.venv/bin/python -m pytest tests/p0 tests/test_agent.py
```

```bash
cd frontend
pnpm exec vitest run src/stores/__tests__/agent.spec.ts src/stores/__tests__/plans.spec.ts src/stores/__tests__/memories.spec.ts src/components/agent src/components/planning src/components/profile/__tests__/AgentMemorySection.spec.ts src/components/__tests__/onboardingEntry.spec.ts src/composables/__tests__/useOnboardingFlow.spec.ts src/composables/__tests__/useAssessment.spec.ts src/views/__tests__/Home.planTabs.spec.ts src/api/__tests__/learningAgent.contract.spec.ts
pnpm exec vue-tsc --noEmit -p tsconfig.app.json
```

这些命令只覆盖 P0 与直接相关模块，不包含无关全量测试，也不执行 APK 构建。

### 最终验证结果

| 验证 | 结果 |
| --- | --- |
| 后端 P0 集合 | 102 passed；5 条既有 Pydantic/SQLAlchemy 弃用警告，无失败 |
| 前端 P0 集合 | 15 个测试文件、34 个测试全部通过 |
| TypeScript | `vue-tsc --noEmit` 通过 |
| MySQL 启动 | `0003_p0_query_indexes` 通过启动守卫，`GET /health` 返回 200 |
| 真实评估入口 | `POST /api/agent/assessments` 返回 201，页面展示评估 1/3 并可刷新恢复 |
| 桌面浏览器 | 图谱、今日计划、任务跳转、评估入口和长问题显示正常 |
| 375 × 812 浏览器 | 对话/学习工具切换、三标签、图谱图例、计划、onboarding、个人页和记忆弹窗正常；页面 `scrollWidth` 等于 375 |

## 上线清单

以下是部署到目标环境时必须再次执行的门禁；本机隔离库演练和待发布 commit 验证已经完成，生产备份与 staging 切换不在本次开发操作范围内。

- [ ] 目标 MySQL 已创建站外持久备份，并完成一次恢复验证。
- [ ] 已核对目标库当前 revision；旧库 stamp 前已与基线逐表比对。
- [ ] staging 升级到 head，旧数据计数和兼容回填一致。
- [ ] 未迁移数据库明确启动失败，已迁移数据库 `/health` 正常。
- [ ] confirm、replan、mastery、revert 重试不会重复写入或错误增版。
- [ ] 模型失败不会留下半成品主题、图谱、计划或正式诊断记忆。
- [ ] 生产日志采样不含 JWT、API Key、完整 prompt 或用户完整答案。
- [ ] 新主题的聊天与推荐入口都进入 onboarding，旧直接生成端点无前端调用方。
- [ ] 桌面与窄屏已复核 onboarding、计划、评估和记忆布局。
- [ ] P0 定向测试在待发布 commit 上重新通过。
