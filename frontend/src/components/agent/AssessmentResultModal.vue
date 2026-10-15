<template>
  <BaseModal :model-value="true" :close-disabled="busy || closeDisabled" @close="close">
    <div class="assessment-result-overlay" @click.self="close">
      <section
        ref="dialogRef"
        class="assessment-result-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="评估结果"
        tabindex="-1"
        @keydown.tab="trapFocus"
      >
        <header class="assessment-result-heading">
          <h2>评估结果</h2>
          <button
            type="button"
            class="result-close ui-icon-button"
            aria-label="关闭评估结果"
            :disabled="busy || closeDisabled"
            @click="close"
          >
            <X :size="18" aria-hidden="true" />
          </button>
        </header>
        <div class="assessment-result-content">
          <AssessmentResult
            :result="result"
            :busy="busy"
            @continue="close"
            @retry="emit('retry')"
            @revert="emit('revert')"
          />
        </div>
      </section>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { X } from '@lucide/vue'
import type { AssessmentResult as AssessmentResultData } from '../../types/learningAgent'
import BaseModal from '../ui/BaseModal.vue'
import AssessmentResult from './AssessmentResult.vue'

const props = withDefaults(
  defineProps<{ result: AssessmentResultData; busy?: boolean; closeDisabled?: boolean }>(),
  { busy: false, closeDisabled: false },
)
const emit = defineEmits<{ continue: []; retry: []; revert: [] }>()
const dialogRef = ref<HTMLElement | null>(null)
let previousFocus: HTMLElement | null = null

function close() {
  if (!props.busy && !props.closeDisabled) emit('continue')
}

function trapFocus(event: KeyboardEvent) {
  const controls = dialogRef.value?.querySelectorAll<HTMLElement>(
    'button:not([disabled]), summary, a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )
  const first = controls?.[0]
  const last = controls?.[controls.length - 1]
  if (!first || !last) {
    event.preventDefault()
    dialogRef.value?.focus()
  } else if (
    event.shiftKey &&
    (document.activeElement === first || document.activeElement === dialogRef.value)
  ) {
    event.preventDefault()
    last.focus()
  } else if (
    !event.shiftKey &&
    (document.activeElement === last || document.activeElement === dialogRef.value)
  ) {
    event.preventDefault()
    first.focus()
  }
}

onMounted(() => {
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  nextTick(() => dialogRef.value?.focus())
})
onBeforeUnmount(() => {
  if (previousFocus?.isConnected) previousFocus.focus()
})
</script>

<style scoped>
.assessment-result-overlay {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--overlay-bg);
}
.assessment-result-dialog {
  display: flex;
  flex-direction: column;
  width: min(760px, 100%);
  height: min(90dvh, 840px);
  max-height: calc(100dvh - 48px);
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: var(--modal-shadow);
  outline: none;
}
.assessment-result-heading {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 26px;
  border-bottom: 1px solid var(--line);
}
.assessment-result-heading h2 {
  margin: 0;
  color: var(--ink);
  font-size: 22px;
  line-height: 1.4;
}
.result-close {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  cursor: pointer;
}
.result-close:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.assessment-result-content {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.assessment-result-content :deep(.assessment-result) {
  width: 100%;
  border: 0;
  border-radius: 0;
}
@media (max-width: 580px) {
  .assessment-result-overlay {
    padding: 12px;
  }
  .assessment-result-dialog {
    max-height: calc(100dvh - 24px);
  }
}
</style>
