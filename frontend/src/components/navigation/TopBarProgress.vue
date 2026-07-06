<template>
  <div class="progress-wrap">
    <div class="progress-label">
      <span>进度</span><span class="progress-count">{{ mastered }} / {{ total }} 节点</span>
    </div>
    <ProgressBar class="progress-track" :value="percentage" label="当前主题学习进度" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ProgressBar from '../ui/ProgressBar.vue'

const props = defineProps<{ mastered: number; total: number }>()
const percentage = computed(() =>
  props.total > 0 ? Math.round((props.mastered / props.total) * 100) : 0,
)
</script>

<style scoped>
.progress-wrap {
  width: 140px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.progress-label {
  display: flex;
  justify-content: space-between;
  color: var(--ink-3);
  font-size: 10.5px;
}
.progress-count {
  font-family: var(--font-mono);
}
.progress-track {
  height: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--bg-3);
}
.progress-track :deep(.ui-progress-bar__fill) {
  border-radius: inherit;
  background: var(--blue-2);
}
</style>
