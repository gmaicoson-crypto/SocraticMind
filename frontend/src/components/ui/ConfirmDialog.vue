<template>
  <BaseModal
    :model-value="modelValue"
    :close-disabled="loading"
    @close="emit('close')"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="ui-confirm-overlay" @click.self="loading ? undefined : emit('close')">
      <section
        class="ui-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        :aria-labelledby="titleId"
      >
        <h2 :id="titleId" class="ui-confirm-dialog__title">{{ title }}</h2>
        <div class="ui-confirm-dialog__content"><slot /></div>
        <div class="ui-confirm-dialog__actions">
          <BaseButton :disabled="loading" @click="emit('close')">{{ cancelText }}</BaseButton>
          <BaseButton class="primary" :loading="loading" @click="emit('confirm')">
            <template #loading>{{ loadingText }}</template>
            {{ confirmText }}
          </BaseButton>
        </div>
      </section>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import BaseButton from './BaseButton.vue'
import BaseModal from './BaseModal.vue'

withDefaults(
  defineProps<{
    modelValue: boolean
    title: string
    confirmText?: string
    cancelText?: string
    loadingText?: string
    loading?: boolean
  }>(),
  {
    confirmText: '确认',
    cancelText: '取消',
    loadingText: '处理中…',
    loading: false,
  },
)

const emit = defineEmits<{
  close: []
  confirm: []
  'update:modelValue': [value: boolean]
}>()

const titleId = `confirm-title-${Math.random().toString(36).slice(2)}`
</script>

<style scoped>
.ui-confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--overlay-medium);
  backdrop-filter: blur(4px);
}
.ui-confirm-dialog {
  width: min(400px, 100%);
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: var(--shadow-modal-sm);
}
.ui-confirm-dialog__title {
  margin: 0;
  color: var(--ink);
  font-size: 20px;
  font-weight: 700;
  line-height: 1.4;
}
.ui-confirm-dialog__content {
  margin-top: 12px;
  color: var(--ink-2);
  font-size: 13px;
  line-height: 1.6;
}
.ui-confirm-dialog__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}
.ui-confirm-dialog__actions :deep(.ui-button) {
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg-2);
  color: var(--ink-2);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: filter var(--transition-fast);
}
.ui-confirm-dialog__actions :deep(.primary) {
  border-color: var(--blue-2);
  background: var(--blue-2);
  color: var(--on-accent);
}
.ui-confirm-dialog__actions :deep(.ui-button:hover:not(:disabled)) {
  filter: brightness(1.08);
}
.ui-confirm-dialog__actions :deep(.ui-button:focus-visible) {
  outline: 2px solid var(--blue-2);
  outline-offset: 3px;
}
.ui-confirm-dialog__actions :deep(.ui-button:disabled) {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
