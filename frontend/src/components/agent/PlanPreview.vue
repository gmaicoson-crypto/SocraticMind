<template>
  <section class="agent-tool preview-tool">
    <div class="preview-heading">
      <div>
        <p>计划预览</p>
        <h3>{{ preview.topic }}</h3>
      </div>
      <span>{{ preview.total_minutes }} 分钟</span>
    </div>

    <dl class="summary-grid">
      <div>
        <dt>领域</dt>
        <dd>{{ preview.domain }}</dd>
      </div>
      <div>
        <dt>成果</dt>
        <dd>{{ outcomeLabel }}</dd>
      </div>
      <div>
        <dt>节点</dt>
        <dd>{{ preview.nodes.length }} 个</dd>
      </div>
      <div>
        <dt>完成日期</dt>
        <dd><TimeDisplay :value="preview.estimated_end_date" /></dd>
      </div>
    </dl>

    <div v-if="preview.risk_notice" class="notice risk">{{ preview.risk_notice }}</div>
    <div v-if="preview.will_miss_target" class="notice delay">
      预计比目标日期晚 {{ preview.delay_days }} 天，将保持每日时间上限。
    </div>
    <p v-for="warning in preview.evidence_warnings" :key="warning" class="notice">{{ warning }}</p>
    <p v-if="preview.evidence_unavailable" class="notice risk">
      教材来源已失效，请重新选择资料并生成计划。
    </p>
    <MaterialEvidence v-if="preview.sources?.length" :sources="preview.sources" />

    <section v-if="preview.diagnostic" class="diagnostic-card">
      <div class="diagnostic-heading">
        <strong>基础测试</strong>
        <span>{{ preview.diagnostic.score }}/100</span>
      </div>
      <div class="weaknesses">
        <span>薄弱点</span>
        <p>{{ preview.diagnostic.weaknesses.join('、') || '暂无明显薄弱点' }}</p>
      </div>
    </section>

    <div class="preview-columns">
      <section class="preview-section">
        <h4>学习节点</h4>
        <ol class="node-list">
          <li v-for="node in preview.nodes" :key="node.key">
            <span>{{ node.label }}</span
            ><small>{{ node.estimated_minutes }} 分钟</small>
            <MaterialEvidence
              :sources="nodeSources(node.source_ids)"
              :cited-ids="node.source_ids"
            />
          </li>
        </ol>
      </section>
      <section class="preview-section">
        <h4>每日安排</h4>
        <ul class="schedule-list">
          <li v-for="group in schedule" :key="group.date">
            <TimeDisplay :value="group.date" />
            <small>{{ group.minutes }} 分钟 · {{ group.count }} 项</small>
          </li>
        </ul>
      </section>
    </div>

    <div class="tool-actions">
      <button type="button" :disabled="busy" @click="regenerate">重新生成</button>
      <button type="button" :disabled="busy" @click="emit('cancel')">取消</button>
      <button
        class="primary"
        type="button"
        :disabled="busy || preview.evidence_unavailable"
        @click="emit('confirm')"
      >
        {{ busy ? '处理中' : '确认创建' }}
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import TimeDisplay from '../ui/TimeDisplay.vue'
import MaterialEvidence from './MaterialEvidence.vue'
import type { AgentRunUpdate, PlanPreview as PlanPreviewData } from '../../types/learningAgent'

const props = withDefaults(defineProps<{ preview: PlanPreviewData; busy?: boolean }>(), {
  busy: false,
})
const emit = defineEmits<{
  update: [input: AgentRunUpdate]
  confirm: []
  cancel: []
}>()

const outcomeLabels: Record<PlanPreviewData['outcome_type'], string> = {
  concept: '理解概念',
  procedure: '掌握操作',
  analysis: '分析判断',
  expression: '表达输出',
  creation: '创作实践',
  mixed: '综合目标',
}
const outcomeLabel = computed(() => outcomeLabels[props.preview.outcome_type])
function nodeSources(ids?: string[]) {
  return (props.preview.sources ?? []).filter((source) => ids?.includes(source.id))
}
const schedule = computed(() => {
  const groups = new Map<string, { date: string; minutes: number; count: number }>()
  props.preview.plan_items.forEach((item) => {
    const group = groups.get(item.scheduled_date) ?? {
      date: item.scheduled_date,
      minutes: 0,
      count: 0,
    }
    group.minutes += item.estimated_minutes
    group.count += 1
    groups.set(item.scheduled_date, group)
  })
  return [...groups.values()]
})
function regenerate() {
  emit('update', {
    regenerate: true,
    goal: props.preview.goal,
    daily_minutes: props.preview.daily_minutes,
    target_date: props.preview.target_date,
  })
}
</script>

<style scoped>
.agent-tool {
  width: min(100%, 680px);
  align-self: center;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  padding: 16px;
  min-width: 0;
  color: var(--ink);
}
.preview-heading {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}
.preview-heading p {
  margin: 0 0 4px;
  color: var(--blue-2);
  font-size: 11px;
  font-weight: 700;
}
.preview-heading h3 {
  margin: 0;
  font-size: 17px;
  overflow-wrap: anywhere;
}
.preview-heading > span {
  flex: 0 0 auto;
  color: var(--ink-2);
  font-size: 12px;
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  margin: 14px 0;
  background: var(--line);
  border: 1px solid var(--line);
  border-radius: 6px;
  overflow: hidden;
}
.summary-grid div {
  min-width: 0;
  padding: 8px;
  background: var(--bg);
}
dt {
  color: var(--ink-3);
  font-size: 10px;
}
dd {
  margin: 3px 0 0;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.notice {
  margin-top: 8px;
  padding: 9px 10px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.5;
}
.risk {
  background: var(--warning-muted-bg);
  color: var(--ink-2);
}
.delay {
  background: var(--blue-tint);
  color: var(--blue-2);
}
.diagnostic-card,
.preview-section {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--bg);
}
.diagnostic-heading {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
}
.diagnostic-heading span {
  color: var(--ink);
  font-weight: 700;
}
.weaknesses {
  display: flex;
  gap: 10px;
  margin-top: 8px;
  font-size: 11px;
}
.weaknesses > span {
  flex: 0 0 auto;
  color: var(--ink-3);
}
.weaknesses p {
  min-width: 0;
  margin: 0;
  color: var(--ink-2);
  overflow-wrap: anywhere;
}
.preview-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}
h4 {
  margin: 0 0 6px;
  font-size: 12px;
}
.node-list,
.schedule-list {
  display: grid;
  gap: 5px;
  margin: 0;
  padding: 0;
  list-style-position: inside;
  max-height: 160px;
  overflow-y: auto;
}
.node-list li,
.schedule-list li {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  padding: 5px 0;
  border-bottom: 1px solid var(--line);
  font-size: 11.5px;
}
.node-list span,
.schedule-list time {
  min-width: 0;
  overflow-wrap: anywhere;
}
small {
  flex: 0 0 auto;
  color: var(--ink-3);
}
.tool-actions button {
  height: 28px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--bg-2);
  color: var(--ink-2);
  padding: 0 9px;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
}
.tool-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
.tool-actions button:first-child {
  margin-right: auto;
}
.tool-actions .primary {
  border-color: var(--blue-2);
  background: var(--blue-2);
  color: var(--on-accent);
}
button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
@container (max-width: 520px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .preview-columns {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
