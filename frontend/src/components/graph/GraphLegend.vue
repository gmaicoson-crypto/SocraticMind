<template>
  <div class="legend-wrap" aria-label="知识节点状态图例">
    <div v-for="item in items" :key="item.variant" class="legend-item">
      <span class="legend-dot" :class="item.variant" />
      {{ item.label }}
      <span class="legend-count">{{ item.count }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  mastered: number
  available: number
  locked: number
}>()

const items = computed(() => [
  { label: '已掌握', count: props.mastered, variant: 'mastered' },
  { label: '可用', count: props.available, variant: 'available' },
  { label: '锁定', count: props.locked, variant: 'locked' },
])
</script>

<style scoped>
.legend-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--ink-2);
  font-size: 11.5px;
  font-weight: 500;
}
.legend-dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border: 1.5px solid var(--locked);
  border-radius: 50%;
  background: var(--bg-3);
}
.legend-dot.mastered {
  border-color: var(--blue-2);
  background: var(--blue);
}
.legend-dot.available {
  border-color: var(--blue);
  background: var(--surface);
}
.legend-count {
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: 10.5px;
}
</style>
