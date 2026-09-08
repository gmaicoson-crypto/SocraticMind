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
      <div><dt>领域</dt><dd>{{ preview.domain }}</dd></div>
      <div><dt>成果</dt><dd>{{ outcomeLabel }}</dd></div>
      <div><dt>节点</dt><dd>{{ preview.nodes.length }} 个</dd></div>
      <div><dt>完成日期</dt><dd>{{ preview.estimated_end_date }}</dd></div>
    </dl>

    <div v-if="preview.risk_notice" class="notice risk">{{ preview.risk_notice }}</div>
    <div v-if="preview.will_miss_target" class="notice delay">
      预计比目标日期晚 {{ preview.delay_days }} 天，将保持每日时间上限。
    </div>

    <div v-if="preview.diagnostic" class="diagnostic-summary">
      <strong>诊断 {{ preview.diagnostic.score }}/100 · {{ preview.diagnostic.level }}</strong>
      <span>{{ preview.diagnostic.weaknesses.join('、') || '暂无明显薄弱点' }}</span>
    </div>

    <div class="preview-columns">
      <section>
        <h4>学习节点</h4>
        <ol class="node-list">
          <li v-for="node in preview.nodes" :key="node.key">
            <span>{{ node.label }}</span><small>{{ node.estimated_minutes }} 分钟</small>
          </li>
        </ol>
      </section>
      <section>
        <h4>每日安排</h4>
        <ul class="schedule-list">
          <li v-for="group in schedule" :key="group.date">
            <span>{{ group.date }}</span><small>{{ group.minutes }} 分钟 · {{ group.count }} 项</small>
          </li>
        </ul>
      </section>
    </div>

    <form class="preview-edit" @submit.prevent="submitUpdate">
      <label><span>目标</span><input v-model="edit.goal" name="goal" maxlength="300" /></label>
      <label><span>每日分钟</span><input v-model.number="edit.daily_minutes" name="daily_minutes" type="number" min="5" max="240" /></label>
      <label><span>目标日期</span><input v-model="edit.target_date" name="target_date" type="date" /></label>
      <button type="submit" :disabled="busy">重新生成</button>
    </form>

    <div class="tool-actions">
      <button type="button" :disabled="busy" @click="emit('cancel')">取消</button>
      <button class="primary" type="button" :disabled="busy" @click="emit('confirm')">
        {{ busy ? '处理中' : '确认创建' }}
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import type { AgentRunUpdate, PlanPreview as PlanPreviewData } from '../../types/learningAgent'

const props = withDefaults(defineProps<{ preview: PlanPreviewData; busy?: boolean }>(), { busy: false })
const emit = defineEmits<{
  update: [input: AgentRunUpdate]
  confirm: []
  cancel: []
}>()

const outcomeLabels: Record<PlanPreviewData['outcome_type'], string> = {
  concept: '理解概念', procedure: '掌握操作', analysis: '分析判断',
  expression: '表达输出', creation: '创作实践', mixed: '综合目标',
}
const outcomeLabel = computed(() => outcomeLabels[props.preview.outcome_type])
const schedule = computed(() => {
  const groups = new Map<string, { date: string; minutes: number; count: number }>()
  props.preview.plan_items.forEach(item => {
    const group = groups.get(item.scheduled_date) ?? { date: item.scheduled_date, minutes: 0, count: 0 }
    group.minutes += item.estimated_minutes
    group.count += 1
    groups.set(item.scheduled_date, group)
  })
  return [...groups.values()]
})
const edit = reactive({
  goal: props.preview.goal,
  daily_minutes: props.preview.daily_minutes,
  target_date: props.preview.target_date ?? '',
})

watch(() => props.preview, preview => {
  edit.goal = preview.goal
  edit.daily_minutes = preview.daily_minutes
  edit.target_date = preview.target_date ?? ''
}, { deep: false })

function submitUpdate() {
  emit('update', {
    goal: edit.goal.trim(),
    daily_minutes: Number(edit.daily_minutes),
    target_date: edit.target_date || null,
  })
}
</script>

<style scoped>
.agent-tool { width: min(100%, 760px); align-self: center; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); padding: 18px; min-width: 0; color: var(--ink); }
.preview-heading { display: flex; justify-content: space-between; gap: 16px; }
.preview-heading p { margin: 0 0 4px; color: var(--blue-2); font-size: 11px; font-weight: 700; }
.preview-heading h3 { margin: 0; font-size: 18px; overflow-wrap: anywhere; }
.preview-heading > span { flex: 0 0 auto; color: var(--ink-2); font-size: 12px; }
.summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px; margin: 16px 0; background: var(--line); border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.summary-grid div { min-width: 0; padding: 9px; background: var(--bg); }
dt { color: var(--ink-3); font-size: 10px; } dd { margin: 3px 0 0; font-size: 12px; overflow-wrap: anywhere; }
.notice { margin-top: 8px; padding: 9px 10px; border-radius: 6px; font-size: 12px; line-height: 1.5; }
.risk { background: color-mix(in srgb, #d97706 10%, var(--surface)); color: var(--ink-2); }
.delay { background: var(--blue-tint); color: var(--blue-2); }
.diagnostic-summary { display: grid; gap: 3px; margin-top: 12px; font-size: 12px; }
.diagnostic-summary span { color: var(--ink-2); overflow-wrap: anywhere; }
.preview-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 16px; }
h4 { margin: 0 0 8px; font-size: 12px; }
.node-list, .schedule-list { display: grid; gap: 5px; margin: 0; padding: 0; list-style-position: inside; max-height: 190px; overflow-y: auto; }
.node-list li, .schedule-list li { display: flex; justify-content: space-between; gap: 10px; min-width: 0; padding: 6px 0; border-bottom: 1px solid var(--line); font-size: 11.5px; }
.node-list span, .schedule-list span { min-width: 0; overflow-wrap: anywhere; }
small { flex: 0 0 auto; color: var(--ink-3); }
.preview-edit { display: grid; grid-template-columns: minmax(0, 1fr) 100px 140px auto; gap: 8px; align-items: end; margin-top: 16px; }
.preview-edit label { display: grid; gap: 4px; min-width: 0; color: var(--ink-3); font-size: 10px; }
.preview-edit input { min-width: 0; width: 100%; height: 32px; box-sizing: border-box; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--ink); padding: 0 8px; }
.preview-edit button, .tool-actions button { height: 32px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg-2); color: var(--ink-2); padding: 0 12px; cursor: pointer; white-space: nowrap; }
.tool-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.tool-actions .primary { border-color: var(--blue-2); background: var(--blue-2); color: white; }
button:disabled { cursor: not-allowed; opacity: .6; }
@media (max-width: 720px) {
  .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .preview-columns { grid-template-columns: minmax(0, 1fr); }
  .preview-edit { grid-template-columns: minmax(0, 1fr) minmax(90px, .5fr); }
  .preview-edit label:first-child { grid-column: 1 / -1; }
}
</style>
