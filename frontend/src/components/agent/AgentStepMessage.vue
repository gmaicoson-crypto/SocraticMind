<template>
  <section class="agent-tool step-tool" aria-live="polite">
    <div class="step-header">
      <span>{{ label }} {{ step.current }}/{{ step.total }}</span>
      <span>{{ Math.round(progress) }}%</span>
    </div>
    <ProgressBar :value="progress" :label="`${label}进度`" />
    <p v-if="showPrompt" class="step-prompt">{{ step.prompt }}</p>
    <div v-if="step.choices.length" class="step-choices">
      <button
        v-for="choice in step.choices"
        :key="choice"
        type="button"
        :disabled="busy"
        @click="emit('answer', choice)"
      >
        {{ choice }}
      </button>
    </div>
    <div class="step-footer">
      <button type="button" :disabled="busy" @click="emit('cancel')">取消流程</button>
      <span v-if="busy">正在提交</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AgentStep } from '../../types/learningAgent'
import ProgressBar from '../ui/ProgressBar.vue'

const props = withDefaults(
  defineProps<{
    step: AgentStep
    kind?: 'diagnostic' | 'assessment'
    busy?: boolean
    showPrompt?: boolean
  }>(),
  {
    kind: 'diagnostic',
    busy: false,
    showPrompt: true,
  },
)

const emit = defineEmits<{
  answer: [answer: string]
  cancel: []
}>()

const label = computed(() => (props.kind === 'assessment' ? '评估' : '诊断'))
const progress = computed(() =>
  props.step.total ? (props.step.current / props.step.total) * 100 : 0,
)
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
}
.step-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  color: var(--ink-2);
  font-size: 11px;
  font-weight: 650;
}
.step-prompt {
  margin: 16px 0 0;
  color: var(--ink);
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.step-choices {
  display: grid;
  gap: 8px;
  margin-top: 14px;
}
.step-choices button {
  width: 100%;
  padding: 9px 11px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--bg);
  color: var(--ink);
  text-align: left;
  cursor: pointer;
  overflow-wrap: anywhere;
}
.step-choices button:hover {
  border-color: var(--blue-line);
  background: var(--blue-tint);
}
.step-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 24px;
  margin-top: 12px;
  color: var(--ink-3);
  font-size: 11px;
}
.step-footer button {
  border: 0;
  background: transparent;
  color: var(--ink-3);
  cursor: pointer;
  padding: 3px 0;
}
</style>
