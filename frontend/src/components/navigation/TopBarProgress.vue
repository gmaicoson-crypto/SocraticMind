<template>
  <div class="progress-wrap" :title="`所有主题：已掌握 ${mastered} / ${total} 个节点`">
    <div class="progress-label">
      <span class="progress-heading"><span class="progress-context">总体</span>进度</span>
      <span class="progress-count" :title="`${mastered} / ${total} 节点`">
        {{ mastered }} / {{ total }} 节点
      </span>
    </div>
    <ProgressBar class="progress-track" :value="percentage" label="所有主题学习进度" />
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
  width: 220px;
  height: 48px;
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  padding: 6px 0;
}
.progress-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--ink-2);
  font-size: 13px;
  line-height: 18px;
}
.progress-heading {
  flex-shrink: 0;
  color: var(--ink);
  font-weight: 600;
  white-space: nowrap;
}
.progress-count {
  min-width: 0;
  overflow: hidden;
  font-family: var(--font-mono);
  font-weight: 600;
  text-align: right;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.progress-track {
  height: 8px;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 999px;
  background: var(--bg-3);
}
.progress-track :deep(.ui-progress-bar__fill) {
  border-radius: inherit;
  background: var(--progress-gradient);
}

@media (max-width: 1100px) {
  .progress-wrap {
    width: 180px;
  }

  .progress-context {
    display: none;
  }
}

@media (max-width: 900px) {
  .progress-wrap {
    width: 160px;
  }
}

@media (max-width: 760px) {
  .progress-wrap {
    height: 44px;
    padding-block: 5px;
    gap: 4px;
  }
}

@media (max-width: 560px) {
  .progress-wrap {
    display: none;
  }
}
</style>
