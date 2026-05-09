# 前端SSE流式输出优化

## 一切问题用中文回答

## 当前任务
解决[CHOICES]的渲染问题，分支：`new-DataBase-MySQL`

## 强制约束（必须遵守）

### Git 相关
- **禁止**切换到其他分支（git checkout / git switch）
- **禁止**合并、rebase 任何分支
- **禁止**删除任何分支
- 只允许在 `new-DataBase-MySQL` 分支上操作

### 数据库相关
- **禁止**执行 DROP TABLE、DROP DATABASE
- **禁止**执行任何未经确认的 DELETE（无 WHERE 条件的 DELETE 必须拒绝）
- **禁止**修改 production 环境的连接配置
- 所有迁移脚本必须先 dry-run / --pretend，确认输出后再执行

### 文件操作
- **禁止**修改 `.env.production` 文件
- **禁止**修改迁移目录之外的业务代码（src/、app/ 等）
- 只允许操作 `migrations/`、`database/` 目录下的文件

## 每步操作前必须
1. 确认当前 git 分支是 `new-DataBase-MySQL`
2. 向我报告即将执行的命令，等待我确认后再执行
3. 迁移执行后立即验证结果

## 遇到错误时
- 立即停止，不要自动回滚
- 报告错误详情，等待我的指示

