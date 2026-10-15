<template>
  <button class="task-row" type="button" :disabled="busy" @click="emit('select', item)">
    <span class="topic-mark" aria-hidden="true">{{ item.topic_emoji }}</span>
    <span class="task-copy">
      <strong>{{ item.node_label }}</strong>
      <small>{{ item.topic_title }} · <TimeDisplay :value="item.scheduled_date" /></small>
    </span>
    <span class="task-meta">
      <span>{{ item.estimated_minutes }} 分钟</span>
      <span :class="['status', item.status]">{{
        item.status === 'completed' ? '已完成' : '待学习'
      }}</span>
    </span>
  </button>
</template>

<script setup lang="ts">
import TimeDisplay from '../ui/TimeDisplay.vue'
import type { TodayPlanItem } from '../../types/learningAgent'

withDefaults(defineProps<{ item: TodayPlanItem; busy?: boolean }>(), { busy: false })
const emit = defineEmits<{ select: [item: TodayPlanItem] }>()
</script>

<style scoped>
.task-row {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 54px;
  padding: 8px 4px;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: transparent;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
}
.task-row:hover {
  background: var(--bg-2);
}
.task-row:disabled {
  cursor: wait;
  opacity: 0.65;
}
.topic-mark {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--bg);
  font-size: 14px;
  overflow: hidden;
}
.task-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}
.task-copy strong {
  font-size: 12px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.task-copy small {
  color: var(--ink-3);
  font-size: 10.5px;
  overflow-wrap: anywhere;
}
.task-meta {
  display: grid;
  justify-items: end;
  gap: 4px;
  color: var(--ink-3);
  font-size: 10px;
  white-space: nowrap;
}
.status {
  padding: 2px 5px;
  border-radius: 4px;
  background: var(--bg-2);
}
.status.completed {
  color: var(--blue-2);
}
</style>
