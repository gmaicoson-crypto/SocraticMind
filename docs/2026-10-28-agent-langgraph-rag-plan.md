# Agent、LangGraph 与 RAG 实施方案

状态：按用户 2026-10-28「先不接入 embedding，继续后续工作」的最新范围，LangGraph 与关键词 RAG 已完成集成验收。真实 embedding 接入和语义质量评测明确延期，不作为本次交付阻塞项，也不标记为已完成。下文保留各阶段历史记录，当前状态以本节、实施清单及文末最终验收记录为准。

## 1. 交付目标与边界

实现用户可操作的资料学习闭环：选择资料 → 基于资料诊断与生成带来源的计划 → 确认后创建主题及节点 → 节点内检索教学 → 根据固定证据出题、评估及复习。无资料的现有学习方式继续可用。

用 LangGraph 执行学习工作流，支持真实持久化、暂停恢复、失败阶段重试、取消和进度查询。保留业务数据库中的权限、版本控制、确认事务和掌握规则。框架接入必须进入生产调用路径，不能只增加依赖或独立演示。

RAG 复用现有附件基础设施，提供共享检索、主题资料关联和来源生命周期管理。支持关键词与可配置语义召回融合；没有配置 embedding 服务时明确使用关键词检索，不伪装成语义检索。

本次不建设开放式多 Agent 系统、不迁移整套聊天流式引擎、不新增图数据库、不自动联网补充用户限定的教材。扫描件 OCR 仍沿用明确的缺页提示，不将未识别页面作为已读证据。

## 2. 当前证据、问题与实施路径

| Evidence：现有实现 | Finding：问题或可复用能力 | Path：实施方向 |
| --- | --- | --- |
| `services/agent/orchestrator.py` 在 HTTP 内同步调用生成服务 | 创建响应慢；执行被进程终止后缺少接管 | 数据库任务、租约和 LangGraph 执行器 |
| `services/agent/run_store.py` 条件版本更新与阶段保存 | 已有并发保护及部分断点能力 | 保留为业务状态控制边界，加入执行归属 |
| `plan_generation.py` 将图谱生成与排期放在同一流程 | 修改时间也重新生成图谱 | 独立图谱结果、确定性排期及按输入失效 |
| `plan_confirmation.py` 单事务创建业务数据 | 可保留原子确认和重复确认结果 | 独立幂等节点，避免与等待确认放在同一节点 |
| `attachments/retrieval.py` 中文词项、邻居补充、预算限制 | 有基础 RAG，缺少语义通道及相关性不足信号 | 公共检索协议与有限混合召回 |
| `attachments/context.py` 按用户/会话/主题/模式过滤 | 跨会话不能直接放宽原有权限 | 增加显式主题资料关联，并保留会话附件语义 |
| `attachments/evidence.py`、`source_snapshots.py` | 已有来源定位、版本和删除检查 | 扩展统一证据校验，不复制一套引用机制 |
| `useAgentRun.ts` 在请求失败返回空值时删除本地恢复索引 | 临时断网可能丢恢复入口 | 仅确定不存在或终态才删除，增加服务端发现 |
| 实施前 `0014_topic_materials`、`0015_grounded_nodes` 已存在，原 head 为 `0016_review_tasks` | 数据库已有主题资料表与节点来源列，业务模型尚未接入 | 复用现有表列；只追加新迁移，保留全部 revision 与祖先链；当前新增至 `0020_agent_step_attempts` |
| 依赖和本地环境均有 `langgraph==1.1.10`、checkpoint 4.0.3 | 不需要先升级框架 | 以已安装版本 API 验证行为，新增适配层 |

## 3. 职责与复用边界

| 模块 | 目标职责 | 保留或复用 |
| --- | --- | --- |
| `routers/agent.py` | 鉴权、请求验证、排队、恢复查询、协议序列化 | 既有 API 路径与响应字段，新增进度字段 |
| `services/agent/orchestrator.py` | 创建/更新/答题/重试/取消的应用服务 | 归属校验、输入指纹、业务版本 |
| `services/agent/workflow.py`（新增） | 定义 LangGraph 节点、条件边和用户等待点 | 生成器注入、既有 Pydantic 输出模型 |
| `services/agent/checkpointer.py`（新增） | SQLAlchemy 持久化 checkpointer | 使用同一个配置数据库，MySQL/测试 SQLite；不引入另一套数据库 |
| `services/agent/jobs.py`、`worker.py`（新增） | 入队、领取、租约、恢复触发、终止与限额 | 参考标题任务的领取模式，不引用聊天业务状态 |
| `services/agent/plan_generation.py` | 模型输入与结构化生成 | `generate_structured`、`prepare_graph` |
| `services/agent/plan_preview.py`（新增） | 纯排期与预览组装 | `build_schedule`、时区日期计算，消除两条分支的重复组装 |
| `services/agent/plan_confirmation.py` | 原子确认与来源绑定 | Topic/Node/StudyPlan/Memory 的既有事务 |
| `services/knowledge/`（新增） | 资料授权、检索协议、索引与证据集合 | Attachment/Chunk、解析 worker、来源快照、上下文预算 |
| `services/assessments.py`、`reviews.py` | 固定题目/评分/来源的评估和复习 | 固定 rubric、掌握阈值、现有复习调度 |
| 前端资料选择与来源展示 | 主题资料绑定、计划来源、执行进度 | AttachmentCard、MessageSources、TimeDisplay、现有表单控件 |
| 前端 Agent store/composable | 会话归属、恢复、有限轮询与清理 | 保留 epoch，卸载和会话切换停止轮询 |

每个模块有明确业务职责；普通文件目标 200–400 行，硬上限 600 行。测试按行为分组，硬上限 800 行。禁止提高历史基线。

## 4. 数据结构与一致性

### 4.1 资料与检索

- `TopicMaterial`：映射已有 `topic_materials(topic_id, attachment_id, revision)`。只有同时拥有主题与文档的用户可绑定；撤销关联立即终止后续读取。
- `Node.material_sources`：映射已有 JSON 列，保存经过服务端验证的文档版本、chunk ID 与定位，不接受模型任意构造页码。
- `EvidenceRef`：`attachment_id/revision/chunk_id/locator/title_path`，可选章节覆盖信息。稳定身份与本轮显示编号分离。
- `RetrievalRequest`：服务端生成的授权范围、query、purpose（问答/计划/出题/复习）、token budget、显式位置和固定版本。
- `RetrievalResult`：状态（ready/no_evidence/unavailable）、sources、coverage、method、耗时和有界统计；低相关结果不得当作肯定证据。
- `KnowledgeEmbedding`（新增表）：按文档版本、chunk、embedding 配置指纹和内容 hash 唯一保存向量及维度。API key 不参与持久化指纹，也不保存到图状态。
- 首版在授权范围内有界检索，关键词与向量结果按排名融合，现有小资料直接阅读、指定页码与全文摘要保留独立策略。可替换的向量存储接口允许将来扩容，不在首版增加外部向量数据库。
- embedding 使用独立可配置 OpenAI-compatible 接口与明确模型、维度、批量和超时限制。索引异步生成，可重试；不可在每次问答重复 embedding 全文。无服务配置/服务失败的降级必须可见且可测试。

### 4.2 工作流状态

- `AgentRun`：业务身份与权限的唯一入口；保留 status/version/result，增加创建幂等标识与输入指纹、工作流版本、可公开的阶段状态。
- `AgentJob`：run ID、操作与输入版本、pending/running/done/failed/cancelled、lease token/until、attempts、next retry；唯一键阻止同一命令重复排队。
- LangGraph checkpoint 与 pending writes：使用正式 checkpointer 接口持久化序列化状态、metadata、父检查点和任务写入；按 run ID 隔离，删除 run 时清理。只使用允许的序列化类型，不启用 pickle 回退。
- 图状态：仅保存阶段、业务版本、恢复命令和请求标识；参数、题目/回答、诊断、图谱、证据引用与预览统一由 AgentRun 持有。相较初稿，避免重复持久化业务正文和双份状态。检查点不放数据库 Session、客户端对象或密钥；执行依赖在构建图时注入。
- `AgentStepAttempt`：步骤、次数、状态、耗时、token（未知必须显式区分）、错误码与输入版本。记录失败尝试，不只统计最终成功。

### 4.3 不变量

1. 数据库事务不得跨模型调用；任务领取与状态发布必须检查租约及版本，过期执行者不能覆盖新状态。
2. LangGraph 拥有内部执行位置；AgentRun 是经版本校验的业务投影，不由两套逻辑分别推进同一内部步骤。
3. 待用户输入使用独立 interrupt 节点；恢复重放不能重复出题或创建业务数据。
4. 确认节点继续调用幂等事务：落库成功但 checkpoint 未保存时，重放读取已完成结果。
5. run ID 来自鉴权后的 AgentRun；不能直接以客户端提供的 thread ID 访问检查点。
6. 取消阻止后续节点及迟到结果发布；同步上游请求不能保证即时停止时，用单次调用超时和总预算限制资源消耗。
7. 只改变每日分钟数、目标日期、时区，复用图谱和证据；目标变化使相关生成结果失效。幂等输入相同不额外调用模型。
8. 检索先限制权限，生成/确认/恢复前再次验证版本和可见性；删除或撤权后不从检查点旧文本恢复材料。
9. 学习偏好用于教学适配；掌握状态始终以现有业务记录为准。评估冻结题目、参考答案、rubric 与证据版本，不能作答后换评分依据。
10. 资料是参考数据；禁止将材料中的指令提升为系统指令。资料不足且用户限定教材时，不自动联网。

## 5. API 与用户流程

- 创建引导/主题计划支持客户端 `request_id` 与选定 `materials`（attachment_id、revision）；返回 run ID 与当前阶段，模型工作移到 worker。重复同 ID 同输入返回同 run，不同输入返回 409。
- 保留 `/api/agent/runs/{id}`、answers、patch、retry、cancel、confirm；扩展 processing/stage/进度和来源信息。答题继续携带 step ID/version，确认携带被确认的预览版本。
- 增加当前用户/会话的活跃 run 查询，补足首次响应丢失和跨设备恢复；客户端恢复索引只是缓存。
- 增加主题资料列表、绑定/解绑接口；资料选择列出用户可使用的 ready 文档，显示已识别范围和版本。
- 聊天继续使用现有流式协议；在现有附件上下文准备阶段调用共享检索，并在节点教学中读取显式主题资料。引用展示复用现有来源卡片。
- 前端显示执行阶段、可取消/重试状态、资料不足信息；轮询有退避和终态停止，页面卸载、切换会话后不继续写旧状态。

## 6. 分批实施与验收

| 批次 | 任务 | 验收标准 |
| --- | --- | --- |
| A | 提取公共排期预览，按影响范围复用图谱；修复前端临时失败丢恢复入口与迟到冲突刷新 | 修改时间模型调用次数为 0，节点不变；目标变化重新生成；网络失败保留索引；切换会话不接收旧响应 |
| B | 接入已有主题资料表/来源列；公共证据类型、权限校验、资料 API 与选择 UI；关键词相关性不足处理 | 未授权绑定/读取失败；删除/解绑即时失效；指定位置准确；无答案不填充无关证据；现有附件定向测试通过 |
| C | 基于资料生成诊断/图谱/计划；节点来源与确认绑定；教学复用主题检索 | 教材片段进入真实模型请求；每个带依据节点引用来自选定版本；确认保留引用；跨会话只能访问显式绑定资料；不改原有掌握语义 |
| D | embedding 配置、批量索引与缓存；关键词+语义融合、检索预算与质量评测 | 同义问法测试改善；重复问答不重建索引；版本与模型切换失效；服务不可用明确降级；无跨用户泄漏；报告 Recall@k、证据支持率及延迟/成本范围 |
| E | SQL checkpointer、真实 LangGraph 节点与 interrupt/resume；复用现有业务服务 | 新进程从数据库恢复；出题/评分成功结果不重复调用；确认重放不重复建主题/计划；修改参数正确失效；图执行测试覆盖真实编译图而非替身 |
| F | 持久任务、worker、幂等创建、租约与取消、进度与服务端恢复；前端接入 | 创建无需等待模型；重复创建返回同 run；过期任务接管；取消后迟到结果不落库；并发答题/确认只有一个有效结果；轮询终止和清理正确 |
| G | 评估/复习使用冻结教材证据，补齐步骤耗时/用量和重试预算 | 评估不因材料更新改变 rubric；撤权终止受影响工作；复习可定位教材；重试有上限，失败尝试计入观测 |
| H | 增量迁移、旧流程兼容、真实启动停止、完整用户路径与交付审计 | 旧 revision 均可顺序升级且历史数据保留；独立进程 main:app 启动/健康检查/停止成功；按全部验收项出具证据 |

批次按依赖顺序推进，可在证据支持时调整顺序，但不得通过删减验收项宣称完成。每批更新实施记录，记录改动目的、收益、限制和验证命令。

## 7. 验证策略与交付门槛

每批修改执行：`node scripts/check-lines.mjs` → 修改部分及相关部分定向测试 → `node scripts/format.mjs --check`。格式失败用 `--write` 修复并审查，之后重跑行数/必要测试及格式。当前 shell 未暴露 node，使用本机已安装 Node 的 bin 目录加入该命令 PATH，不修改用户全局配置。

后端用 `backend/.venv/bin/python -m pytest`，在 backend 工作目录运行目标测试；前端用 `pnpm --dir frontend test <目标文件>`。涉及迁移/入口时复用 `test_migrations.py` 的隔离 SQLite 与附件目录，并追加新 worker 的退出断言。最终覆盖 API、存储、图执行、检索与前端的相关集成测试，不以全仓测试或 APK 构建代替。

质量评测包含中文同义词、专有术语、指定页码、跨章节、无答案、缺页、旧版本和权限撤销。确定性测试使用受控模型输出证明协议和边界；语义模型质量与真实供应商可用性单独记录，不能用 mock 成绩宣称生产模型质量已验证。配置不足时明确记录限制并继续完成可独立验证的工作。

最终交付：实现代码、保持祖先链的新迁移、部署/配置说明、定向测试和实际运行记录、逐项完成审计。没有充分证据的验收项保持未完成。

## 8. 实施记录

- [x] 方案：重新检查工作区、现有表与依赖，明确复用、数据模型、阶段和验收标准。
- [x] A：排期复用与前端恢复。提取 `plan_preview.py`；保存可复用图谱，时间调整零模型调用，目标改变重新评分/生成；保留临时失败的恢复索引，忽略导航后的冲突刷新。
- [x] B：资料范围与共享检索。后端模型、API、权限/版本验证、公共来源构造、结构覆盖检索与相关性不足处理；引导表单资料选择与主题资料管理界面均已接入。
- [x] C：教材计划与教学。固定资料版本进入诊断、评分与图谱生成；节点引用验证、确认绑定、主题聊天及概览检索进入实际调用路径；历史来源重新验证。
- [ ] D（用户明确延期）：索引、混合检索、降级、界面和评测脚本保留；本次不启用 embedding，不进行真实语义质量验收，不阻塞其余交付。
- [x] E：真实图、SQL 检查点、独立暂停节点、跨进程恢复与幂等重放已接入生产调用路径并验证；自动调度与租约属于 F 批。
- [x] F：持久任务、租约隔离、取消与有限重试、幂等创建、异步接口及前端恢复已接入并通过定向验证。
- [x] G：教材评估/复习与来源界面、模型步骤尝试记录、失败/未知用量及调用预算已接入并完成定向验证。
- [x] H：按最新范围完成工程集成、迁移、逐项审计及关闭 embedding 的学习闭环验收；语义质量评测单独列为后续事项。

### A 批验证记录

- 后端：`cd backend && .venv/bin/python -m pytest tests/p0/test_agent_replanning.py tests/p0/test_agent_orchestrator.py tests/p0/test_agent_api.py tests/p0/test_agent_permissions.py tests/p0/test_planning.py tests/p0/test_migrations.py::test_real_application_starts_and_stops_in_a_fresh_process -q`，24 项通过。
- 前端：`pnpm --dir frontend test src/composables/__tests__/useAgentRun.spec.ts src/stores/__tests__/agent.spec.ts src/composables/__tests__/useOnboardingFlow.spec.ts src/composables/__tests__/useAssessment.spec.ts`，18 项通过。
- 行数检查：8 个代码文件，0 个豁免，通过。格式检查初次发现排版差异，执行修复并审查 diff 后再次通过。
- 限制：尚未接入持久工作流、资料检索或异步任务；此批只建立可复用排期与安全恢复基础。

### B 批后端验证记录（批次尚未全部完成）

- 复用历史迁移中的 `topic_materials` 与 `nodes.material_sources`，新增 ORM 映射；未修改已应用迁移。
- 新增 `/api/knowledge/documents`、主题资料 GET/PUT、主题检索 POST。资料关联使显式选定的草稿文档持久保留；最后一次解除关联的未发送草稿恢复过期回收。
- 将附件来源构造提取到公共 `source_snapshots.file_source`，原有附件上下文复用同一实现；检索词项排序提取为公共函数，旧附件流程保留原行为，新知识检索要求相关性。
- 公共检索限制候选数和实际序列化来源 token 数，计划用途按文档/章节轮转抽取并报告部分覆盖。证据恢复从当前文档重读正文，拒绝伪造定位、旧版本、删除和已解绑来源。
- 后端命令：`cd backend && .venv/bin/python -m pytest tests/p0/test_knowledge_materials.py tests/p0/test_attachment_context.py tests/p0/test_attachment_chat.py tests/p0/test_migrations.py::test_real_application_starts_and_stops_in_a_fresh_process -q`，41 项通过。
- 格式修复后重跑上述定向测试通过；行数检查 23 个代码文件、0 个豁免，通过；统一格式校验和 `git diff --check` 通过。
- 尚未完成：选择界面、生成请求中的材料输入、计划/聊天生产调用路径、语义索引与 LangGraph 执行。不能以此批 API 测试替代最终学习闭环验收。

### B 界面与 C 批验证记录

- `MaterialSelector` 复用现有附件类型，按需加载、固定版本、最多 20 份、分页读取；加载失败可刷新，卸载取消请求，迟到响应不更新界面。引导表单与主题资料管理对话框复用同一组件。
- 在主题管理中提供资料绑定/解绑，保存期间防重复提交；计划及节点引用复用 `MessageSources` 和附件查看器，不另造来源展示逻辑。
- 生成前保存仅含引用身份的证据集合，每次模型调用前重读正文；模型调用后与确认事务内再验证版本/权限。图谱每个带依据节点必须引用提供的来源 ID，虚构 ID 阻止发布。调整排期继续零模型调用。
- 计划与历史消息持久化不保存资料原文片段；API 读取和历史恢复重新加载有效来源，删除、换版本和解绑后返回失效状态。确认保留节点引用并绑定主题教材，重复确认不重复创建数据。
- 主题问答及节点/主题概览在原有流式准备阶段调用共享检索。跨会话访问只通过显式主题绑定，原有附件 session/topic/mode 校验保留；附件与教材共享输入预算，来源编号避让。
- 无相关证据明确进入 `no_evidence`，限定教材不会自动联网。生成期间及发布前验证资料可用性；删除资料后阻止迟到答案，失败事件和历史回放清空失效来源片段。
- 后端定向回归：`test_grounded_planning.py`、`test_grounded_chat.py`、`test_agent_replanning.py`、`test_agent_orchestrator.py`、`test_agent_api.py`、`test_agent_permissions.py`、`test_knowledge_materials.py`、`test_attachment_context.py`、`test_attachment_chat.py`、`test_chat_context.py`、`test_web_evidence.py`、`test_plans_api.py` 及独立进程启动关闭测试，合计 **122 项通过**。
- 该扩展回归发现原有 `test_chat_context.py` 未隔离后台联网决策，退出时出现供应商超时日志；已在该测试模块显式使用真实 off 模式，避免上下文测试调用外部模型。修复后重新运行上下文、教材教学、附件聊天和资料检索的定向组合，**44 项通过**，退出时不再出现该超时日志。
- 前端：资料选择、主题资料保存、引导、计划预览、主题管理、附件来源和通用来源展示共 **41 项通过**；Agent store、恢复和引导流程另 **15 项通过**；`vue-tsc --noEmit` 通过。
- 格式化时发现模板内多语句事件被改写后无法解析，改为有名处理函数并重新通过相关界面测试。最终行数校验覆盖 50 个文件，0 个豁免；统一格式校验与 diff 空白检查通过。
- 收益：同一份解析后的教材可用于计划和多会话教学，来源生命周期集中管理；代价：每次使用均需权限/版本读取，当前检索仍是有界关键词/结构检索，尚无语义索引。受控模型测试验证协议与边界，不代表真实模型教学质量。
- 尚未完成：D–H，包括 embedding 索引、LangGraph 持久执行、异步任务、评估复习与最终交付审计。当前不能称为完整集成已交付。

### D 批实现与待验收项

- 新增 `0017_knowledge_indexes`，按文档版本、模型/连接/前缀指纹和正文 hash 保存向量；任务使用租约、批处理、有限重试与缓存续建。删除资料同步清理向量和索引任务，索引发布前重新验证版本/内容。
- OpenAI 兼容客户端限制输入、响应大小、并发和总时限；长分块按 UTF-8 安全切分并聚合，不静默截断。数据事务不跨网络调用。任务在请求前预占调用和未知用量计数，成功后按供应商返回补记已知 token。
- 按用户和授权资料范围融合关键词/语义排名，指定页码绕过向量调用；未建索引、配置错误和供应商失败均有明确降级提示，聊天 SSE 和历史保留检索方式及指标。资料选择组件显示索引状态并支持重试，迟到响应不跨导航更新。
- 按用户「复用 LLM」要求新增 `KNOWLEDGE_EMBEDDING_LLM_PROFILE`，复用服务端默认或指定配置的地址与凭证。embedding 模型仍独立指定；继承连接时禁止混用覆盖地址/密钥，防止配置错误把旧凭证发到其他服务。前端聊天模型切换不影响索引服务。
- 2026-10-28 对两个已有 LLM 服务做了只读 `/models` 检查，均返回 HTTP 200，分别列出 19 和 2 个模型，未列出 embedding 模型。该结果不能证明接口绝对不支持 embedding，但不足以选定真实向量模型；未改本地密钥配置，也未假定聊天模型可输出合格向量。
- 隔离公开语料评测脚本已建立：3 份资料、8 个片段、12 个查询，覆盖中文、英文同义问法、跨章节、指定页码与无答案。关键词基线实测 Recall@5 = 0.80，标注片段命中率 = 0.6111，无答案弃答率 = 1.0；本机 P50/P95 为 1/10 ms，不包含真实供应商调用。报告 `/tmp/socraticmind-retrieval-baseline.json` 的 `semantic_evaluated=false`；这些数字不能当作真实语义质量或生成答案正确率。
- 格式修复后的后端定向组合：embedding 客户端、索引任务、混合检索、评测、资料权限、附件上下文/聊天、教材教学、迁移及独立进程启动关闭，**82 项通过**。资料选择/资料管理前端 **10 项通过**，`vue-tsc --noEmit` 通过；行数、统一格式和 diff 空白检查通过。
- 收益：复用现有解析、来源和展示组件，后台建索引后重复提问只向量化问题；限制：当前是受限范围内的数据库向量扫描，尚未做生产规模性能评测，也未完成真实 embedding 质量/成本验收。D 保持未完成。

### E 批持久工作流验证记录

- 新增 `0018_agent_checkpoints`，接续 `0017`，仅追加检查点和 pending writes 表；使用项目现有 SQLAlchemy 引擎，未改写历史 revision。读取绑定已鉴权用户与 run，序列化关闭 pickle、限制类型与单条大小，不将运行时配置复制进 metadata。
- 引导和现有主题计划已通过真实编译的 LangGraph 执行：出题、评分、图谱、排期、确认是独立节点，等待答案/确认使用独立 interrupt 节点；同步保存检查点。复用既有结构化生成、证据重验、run 版本更新和原子确认事务，未新建第二套生成器或业务存储。
- 生成成功结果先提交到 AgentRun，节点重放读取已完成结果；图状态只保存阶段、版本和恢复指令。修改时间继续复用图谱，修改目标重算相关结果；模型调用期间没有业务数据库事务。
- 故障测试分别在出题、评分、图谱及确认事务提交后模拟检查点丢失；恢复没有重复成功模型调用或创建重复主题/计划。独立的 4 次 Python 进程覆盖创建、回答与生成、确认、重复确认；第二进程只调用评分和图谱，后两次确认零模型调用。
- 使用真实编译图验证每题暂停、确认暂停、跨用户拒绝、历史游标、取消后的迟到恢复及并行节点 pending writes：一个节点失败后仅重试失败节点。写入保护接口已留给 F 批租约检查，并验证保护失败不落库；不能据此声称生产租约调度已完成。
- 初次集成发现 LangGraph 即使采用同步持久化也会并发提交检查点和 pending writes，与内存 SQLite 的单连接冲突；在同一 saver 内串行数据库操作后相关回归通过，独立进程测试另使用实际 SQLite 文件。
- 最终定向组合：`test_agent_workflow.py`、`test_agent_workflow_persistence.py`、原 Agent 编排/排期/接口/权限、教材计划、增量迁移和真实 `main:app` 启停，共 **37 项通过**。
- 收益：执行位置持久化，可在新进程恢复且不会重复已提交副作用；代价：增加检查点写入与恢复读取。当前 HTTP 仍同步执行图；持久队列、自动接管、并发租约及前端状态恢复继续由 F 批完成，评估/复习教材依据由 G 批完成。
- 参考：[LangGraph interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts)、[持久化说明](https://docs.langchain.com/oss/python/langgraph/persistence)。实际 API 同时对照项目已安装的 `langgraph==1.1.10` 与 `langgraph-checkpoint==4.0.3` 验证，未直接使用新版文档中的未安装 API。

### 提交安排

- 按用户要求创建独立的「SocraticMind 提交管理」会话；该会话已完成只读候选批次整理，当前未执行 commit 或 push。
- 功能开发与验证继续在本会话进行。A/B/C 存在同文件交叉改动，实际提交应以已完成范围和最终差异为准，不直接按整文件硬拆。


### F 批验证记录

- 复用既有 LangGraph 和业务服务，新增持久命令、租约及进程监督模块；生产计划接口写入命令后即返回，worker 使用同一个执行入口。每个 API 实例同时最多执行一个子进程，用户最多 4 个待处理命令；租约 45 秒、心跳 2 秒、单次执行上限 600 秒、异常最多 3 次尝试。等待用户不占容量，正常停止重新入队且不消耗重试次数。
- 迁移 `0019_agent_jobs` 延续 `0018`，创建 ID 按用户唯一；同请求重放返回原 run，复用 ID 修改内容拒绝。答题/确认通过版本 CAS 和命令状态避免重复副作用，确认带版本；结果和检查点均受租约保护，旧 worker 的迟到发布被拒绝。
- 支持恢复旧版本遗留的 processing run，每分钟最多接管 20 条；恢复已保存题目时清除旧忙碌标志，不再次出题。预期失败写入聊天历史，确认排队期间不重复添加预览历史。
- 前端新增可复用进度组件与轮询控制器；无重叠轮询、网络错误退避、终态/等待输入停止；切换会话和卸载取消请求并拒绝旧响应。创建请求 ID 保留到成功响应，登出清理；本地索引缺失可按用户和会话从服务端恢复。
- 后端定向验证：`test_agent_jobs.py`、`test_agent_worker.py`、`test_agent_api.py`、`test_agent_permissions.py`、`test_agent_orchestrator.py`、`test_agent_replanning.py`、`test_agent_workflow.py`、`test_agent_workflow_persistence.py`、`test_grounded_planning.py`、`test_grounded_chat.py`、`test_knowledge_migrations.py` 及独立进程 `main:app` 启停用例，**58 项通过**。覆盖实际 spawn 子进程、阻塞模型取消/停止、租约接管及旧写入拒绝、并发创建/答题/确认、队列容量、迁移与历史数据保留。模型输出受控，不代表真实模型质量。
- 前端定向验证：`dialogueRecovery.spec.ts`、`onboardingEntry.spec.ts`、`dialogueAssessment.spec.ts`、`agentAsync.spec.ts`、`agent.spec.ts`、`useAgentRun.spec.ts`、`useOnboardingFlow.spec.ts`，**67 项通过**；`vue-tsc --noEmit` 通过。恢复组件测试隔离真实 API，未调用本地未启动的后端。
- 收益：创建无需等待模型，重启与响应丢失后可恢复；代价：增加子进程启动和数据库写入。数据库长期阻塞仍可能影响关闭时限，MySQL 实机并发/负载尚未验证。D 的真实 embedding 质量、G 的教材评估/复习与观测、H 的最终集成审计仍保持未完成。


### G 批教材评估与复习

- 复用已有题目、参考答案和评分量规冻结机制，以及主题资料检索/来源重验。优先使用节点确认的教材来源；没有节点来源时，仅在绑定资料内按节点检索。无相关正文拒绝出题。每题模型引用必须属于实际选定来源，持久化时去掉教材正文。
- 评分复用原题、原参考答案和原量规，使用冻结来源重验后读取的正文，不再检索改变依据；增加资料不改写原评估，删除/解绑/版本变化在答题、生成返回和掌握更新前被拒绝。复习继续使用原题及量规，评分前后重验来源，保留原 0–4 分复习规则，不改节点掌握语义。
- 结果概览及每题详情复用 `MaterialEvidence`；错题复习显示教材位置，资料失效时禁止提交。Agent 结果、节点最新评估、聊天历史及复习详情均重载有效正文，撤权后返回不可用标记，不从历史 JSON 重放正文；历史评分保留。
- 原评估服务 577 行，按流程入口、生成评分、共享状态持久化拆为 243/312/63 行；教材适配独立在 `knowledge/assessment_context.py`。没有新增行数豁免，也没有修改已应用迁移。
- 后端定向回归（教材评估、教材计划、Agent API、评估服务/量规/历史、复习、聊天上下文、跨领域 fixture 及独立进程 `main:app` 启停）**75 项通过**；追加节点原引用复用及解绑拒绝用例后，教材评估模块 **10 项通过**（与前述回归存在重叠，不相加）。前端评估结果/弹层、复习与对话评估 **39 项通过**，`vue-tsc --noEmit` 通过。所有模型输出均为受控测试，未据此宣称真实模型评分质量。
- 收益：一次评估的教材依据和评分标准一致，复习能定位原资料；代价：增加权限/版本查询，来源失效后需重新评估。步骤尝试记录、失败用量与预算观测尚未完成，G 保持未完成；D 的真实 embedding 质量与 H 的最终审计仍待完成。

- 本批最终行数检查覆盖 109 个变更代码文件、0 个豁免，通过；格式校验、`git diff --check` 及新增评估模块的 Ruff F 检查通过。


### G 批模型步骤观测与预算

- 增量迁移 `0020_agent_step_attempts`、`AgentStepAttempt` 模型及共享 `invoke_observed` 接入既有计划、评估、复习调用入口。独立记录输入版本、阶段、模型配置 ID、状态、耗时、尝试次数及错误码；不保存提示词、模型正文、资料正文或凭证，也不通过统计更新业务版本。
- 结构化生成逐次记录失败响应和修复响应，输出被截断时仍保留已报告 token；部分用量缺失时明确 `tokens=null`，另保留已知部分 `reported_tokens`。前一修复已有用量而后一调用超时时不会丢失已知部分。终止/取消/租约接管关闭未结束记录，条件回写防止迟到成功覆盖中断；业务校验拒绝的已生成结果标为 `rejected`。
- 模型步骤调用上限：每个 run 32 次；同一复习题输入版本 3 次，包含失败与中断。调用内默认最多一次 JSON 修复，共用既有总超时；worker 的执行时间及自动尝试预算保留。用量未知不当作免费调用。上限错误通过既有失败响应反馈，前端不提供不可执行的重试。
- 查询接口：`/api/agent/runs/{id}/attempts`、`/api/plans/reviews/{id}/attempts`，按所属用户校验，游标分页，不输出租约 token。`AgentRun.token_usage` 保留历史兼容语义，总费用判断使用完整尝试记录并保留未知项。
- 修复 embedding 查询失败后降级造成的未知用量漏计：检索结果增加 `query_attempted`，评测以实际尝试标志统计未知用量，而非只统计最终 hybrid 结果。
- 后端定向验证组合 **86 项通过**：观测、结构化生成、持久任务、真实子进程 worker、混合检索、评测、评估、教材评估、跨进程图恢复与独立 `main:app` 启停。补充观测/Agent API/评估历史/复习/教材计划组合 **38 项通过**（组合存在重叠，不相加）。覆盖失败用量、修复分项、未知用量、预算拒绝且零额外模型调用、分页/跨用户权限、迁移前后历史 run 保留、取消和停机记录。
- 前端 store、异步恢复、对话评估与错题复习 **34 项通过**，`vue-tsc --noEmit` 通过。达到模型调用上限显示明确原因且 `canRetry=false`。
- 收益：能追踪失败、修复和中断的已知消耗；代价：增加短事务写入。未报告用量不是零费用，实际供应商账单与真实模型质量仍不能由受控测试推断。G 验收项完成，D 的真实 embedding 质量与 H 的最终审计保持未完成。

### H 批集成审计与剩余交付条件

- 实际生产路径通过本地 OpenAI 兼容 HTTP/SSE 服务与真实 spawn 子进程串联：资料选择 → 诊断三题 → 评分/计划 → 调整时间 → 确认主题 → 教材教学 → 评估三题 → 错题复习。断言 7 次模型请求均含教材上下文，时间调整不新增调用，确认与各结果保留来源。受控服务只决定模型输出，不替换 SDK、任务执行器或 LangGraph。
- 发现 SQLite 运行连接未启用外键，run 删除后新检查点/任务表可能残留。抽取公共 `create_runtime_engine`，API、worker 和子进程统一启用外键；测试 fixture 使用隔离文件库。验证 ORM 建表与真实 Alembic 升级后的删除级联，并验证删除后到达的心跳/完成/失败回写均失效。好处是清理由数据库保证；代价是写入必须满足关联完整性。迁移引擎及已部署 revision 未修改。
- 修复「重新生成」传入相同参数时被当作无操作的问题：显式意图附带稳定请求 ID 和预览版本，保留诊断、重建新主题图谱；同意图重放零新增调用，ID 内容冲突和过期版本返回 409。已有主题不替换业务节点。普通时间改动仍零模型调用。前端响应丢失重试复用 ID；另拒绝必需参数的显式 null，截止日期仍可清空。
- 历史迁移测试曾将 `0016_review_tasks` 硬编码为 head，现通过 `ScriptDirectory` 读取实际 head，保留对历史聊天、节点和资料关联的原数据断言。
- 本批后端第一组：`test_migrations.py`、`test_knowledge_migrations.py`、`test_learning_acceptance.py`、`test_attachment_context.py`、`test_attachment_chat.py`、`test_chat_lifecycle.py`、`test_progress_archive.py`，**74 项通过**。包含独立进程 `main:app` 的导入、生命周期、健康检查及 worker 退出断言。
- 补充代码后的后端第二组：`test_agent_replanning.py`、`test_knowledge_migrations.py`、`test_agent_workflow.py`、`test_agent_workflow_persistence.py`、`test_agent_worker.py`、`test_learning_acceptance.py`，**30 项通过**。含真实升级后的级联删除、显式 null 校验、跨进程恢复与取消/停机。两组存在重叠，不将数字相加。
- 本批前端：计划预览、Agent store、异步恢复及引导流程 **28 项通过**，`vue-tsc --noEmit` 通过。后续只改后端校验与迁移测试，未再修改前端。行数检查覆盖 **119 个变更代码文件、0 个豁免**，均在硬上限内；部分历史大组件仍有建议阈值提醒。相关模块 Ruff F 检查、统一格式校验和 diff 空白检查通过。
- 2026-10-28 复用现有 LLM 配置进行了真实 `/embeddings` 能力探测，仅发送短公开文本：现有两个模型返回 503，另一服务的现有模型返回 404，均没有返回向量。未将聊天输出冒充 embedding，也未修改 `.env`。这些结果不证明同一服务的其他模型不支持 embedding；仍需实际可用的 embedding 模型名。

逐项验收索引（文件均位于 `backend/tests/p0/`；前端用例见对应批次）：

| 验收范围 | 主要证据 | 结论 |
| --- | --- | --- |
| A：时间改参复用、目标失效、恢复归属 | `test_agent_replanning.py`，前端 `useAgentRun.spec.ts`、`agentAsync.spec.ts` | 通过；重新生成作为独立意图另有幂等验证 |
| B：绑定权限、删除/解绑、指定位置、无相关证据、附件兼容 | `test_knowledge_materials.py`、`test_attachment_context.py`、`test_attachment_chat.py` | 通过 |
| C：真实请求上下文、引用验证、确认绑定与教材教学 | `test_grounded_planning.py`、`test_grounded_chat.py`、`test_learning_acceptance.py` | 通过；HTTP/SSE 模型输出受控 |
| D：索引缓存、配置/版本隔离、限额、失败降级与权限 | `test_embedding_client.py`、`test_knowledge_indexing.py`、`test_hybrid_retrieval.py`、`test_knowledge_evaluation.py` | 工程行为通过；用户明确延期真实 embedding 接入及质量验收，本次保持关闭 |
| E：真实编译图、独立进程、成功结果/确认重放 | `test_agent_workflow.py`、`test_agent_workflow_persistence.py` | 通过 |
| F：异步创建、幂等、租约接管、取消、并发与前端清理 | `test_agent_jobs.py`、`test_agent_worker.py`、`test_agent_api.py`，前端恢复用例 | 通过；未声称完成真实 MySQL 负载验证 |
| G：冻结量规/来源、撤权、复习、失败用量与预算 | `test_grounded_assessments.py`、`test_agent_observability.py`，既有评估/复习及相关界面用例 | 通过；供应商未知用量仍明确为未知 |
| H：迁移数据保留、真实启停、完整路径与清理 | `test_migrations.py`、`test_knowledge_migrations.py`、`test_learning_acceptance.py` | 当前范围通过；关闭 embedding 的完整学习路径已再次验证 |

当前边界：没有用浏览器跑整条界面流程，前端由组件/store 测试和类型检查覆盖；完整路径为后端接口级验收。向量扫描仍有范围和时限限制，尚无生产规模基准；MySQL 实机并发与真实模型教学/评分质量也未由受控测试证明。以后启用 D 批能力时仍需完成真实 embedding 质量验收。

后续重新启动 D 批时，需要可用 embedding 服务的模型与连接配置；仅同一服务支持该模型时才能复用原连接和密钥。届时在隔离语料上执行真实索引与检索，对比关键词基线，补充同义召回、无答案、延迟和已知/未知用量报告。本次按用户决定不等待此输入。当前未 commit 或 push。

### 现有 DeepSeek 服务专项核实（2026-10-28）

- 按用户要求，用项目的多行 `.env` 加载器读取现有 DeepSeek 配置；服务为官方 `https://api.deepseek.com`，聊天模型为 `deepseek-flash`。凭证只在进程中用于该服务请求，未输出或写入报告。
- 使用该配置调用 `GET /models` 返回 200，模型列表只有 `deepseek-flash` 和 `deepseek-v4-pro`。对两个返回的模型分别调用 `POST /embeddings` 与 `POST /v1/embeddings`，四次请求全部返回 404，没有向量。探测输入仅为一条公开短句，无业务教材数据。
- 对照 [官方模型列表接口](https://api-docs.deepseek.com/api/list-models/) 与 [官方调用说明](https://api-docs.deepseek.com/quick_start/)，文档列出上述生成模型，没有列出 embedding API。结论限定为当前官方服务、当前账号公开可用的能力，不能据此推断所有托管 DeepSeek 的第三方平台都无向量服务。
- 未找到可直接配置的 embedding 模型，因此未修改 `.env`，也未启用会持续失败的索引任务。真实语义质量验收仍未执行；后续需要独立可用的 embedding 服务，DeepSeek 可继续负责诊断、生成、评估与复习。

### 关闭 embedding 的最终验收（2026-10-28）

- 范围依据：用户明确要求先不接入 embedding，继续后续工作。保留现有适配代码和延期验收项，不安装本地模型、不更换 LLM 服务，也不把关键词成绩称为语义检索成绩。
- 复用 `test_learning_acceptance.py` 完整路径，新增断言：资料索引状态为 `disabled`，教学检索为 `lexical`，`query_attempted=false`，全程没有向量或索引任务记录。实际 HTTP/SSE 测试服务只接受聊天接口；诊断、确认、教学、评估、复习和删除清理均通过真实调用链完成。
- 后端定向组合 **49 项通过**：`test_learning_acceptance.py`、`test_grounded_chat.py`、`test_grounded_assessments.py`、`test_knowledge_materials.py`、`test_agent_workflow_persistence.py`、`test_agent_jobs.py`、`test_agent_worker.py`、`test_migrations.py::test_real_application_starts_and_stops_in_a_fresh_process`。命令为 `cd backend && .venv/bin/python -m pytest -o addopts='' -q <上述文件或用例>`。
- 前端定向组合 **36 项通过**：资料选择、计划预览、评估结果、错题复习、异步 Agent store、`useAgentRun`，使用 `pnpm --dir frontend test` 指定六个对应 spec 文件；未改前端生产代码，先前通过的类型检查仍适用。
- 重新运行公开语料关键词评测，持久报告见 [关键词检索报告](reports/2026-10-28-rag-lexical-evaluation.json)：Recall@5 = 0.80，标注片段命中率 = 0.6111，无答案弃答率 = 1.0，本机 P50/P95 = 1/4 ms，embedding 调用为 0，`semantic_evaluated=false`。仅 12 个查询的小样本，不能推断生产准确率或生成答案事实正确率；同义改写仍有未召回案例。
- 部署沿用 `backend/README.md`：备份目标数据库、执行追加迁移至 `0020_agent_step_attempts`，启动后检查健康接口。当前有效配置 `knowledge_embedding_enabled=false`，无需增加 embedding 模型或凭证；这次验证没有迁移业务数据库。
- 当前交付为 LangGraph 持久工作流、异步任务恢复与取消、关键词/位置教材 RAG、来源生命周期、教材评估复习和模型调用观测。收益是不依赖新增向量服务即可使用完整学习闭环；限制是语义近似但用词不同的问题可能检索不到，需要提供教材术语或章节定位。
