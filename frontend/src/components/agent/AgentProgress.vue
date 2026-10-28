<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ stage?: string | null; busy?: boolean; error?: string }>()
defineEmits<{ cancel: [] }>()
const labels: Record<string, string> = {
  queued: '学习任务正在排队',
  diagnostic_questions: '正在准备诊断问题',
  diagnostic_score: '正在分析你的回答',
  graph_draft: '正在生成学习路径',
  schedule: '正在安排学习日程',
  existing_plan: '正在安排学习日程',
  confirm: '正在保存学习计划',
  saving: '正在保存进度',
  resume: '正在恢复学习任务',
}
const label = computed(() => labels[props.stage ?? ''] ?? '学习任务正在执行')
</script>

<template>
  <div class="agent-progress" role="status" aria-live="polite">
    <strong>{{ label }}</strong>
    <span>{{ error || '进度会自动更新，可以稍后返回继续。' }}</span>
    <button type="button" :disabled="busy" @click="$emit('cancel')">取消任务</button>
  </div>
</template>

<style scoped>
.agent-progress {
  display: grid;
  gap: 8px;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
}
.agent-progress button {
  justify-self: start;
}
</style>
