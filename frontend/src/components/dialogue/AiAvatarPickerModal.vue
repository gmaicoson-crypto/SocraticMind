<template>
  <BaseModal :model-value="true" :close-disabled="busy" @close="emit('close')">
    <div class="avatar-overlay" @click.self="close">
      <section class="avatar-dialog" role="dialog" aria-modal="true" aria-label="选择对话 AI 头像">
        <header class="avatar-header">
          <div class="avatar-heading">
            <img :src="avatarSrc(currentUrl)" alt="" />
            <h2>对话 AI 头像</h2>
          </div>
          <button
            type="button"
            class="close-button"
            aria-label="关闭"
            :disabled="busy"
            @click="close"
          >
            <X :size="18" />
          </button>
        </header>
        <div class="avatar-content">
          <AvatarPresetPicker
            label="AI 头像"
            :options="aiAvatarPresetsForMode(mode)"
            :model-value="currentUrl"
            :disabled="busy"
            @select="emit('select', $event)"
          />
          <input
            ref="fileInput"
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            class="file-input"
            @change="onFileChange"
          />
          <button type="button" class="upload-button" :disabled="busy" @click="fileInput?.click()">
            <Upload :size="16" />
            {{ busy ? '上传中…' : '上传图片' }}
          </button>
          <p v-if="error" class="avatar-error" role="alert">{{ error }}</p>
        </div>
      </section>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Upload, X } from '@lucide/vue'
import { avatarSrc } from '../../utils/avatar'
import { aiAvatarPresetsForMode } from '../../utils/avatarPresets'
import type { ChatMode } from '../../types'
import BaseModal from '../ui/BaseModal.vue'
import AvatarPresetPicker from '../profile/AvatarPresetPicker.vue'

const props = defineProps<{ mode: ChatMode; currentUrl: string; busy: boolean; error: string }>()
const emit = defineEmits<{ close: []; select: [url: string]; upload: [file: File] }>()
const fileInput = ref<HTMLInputElement | null>(null)

function close() {
  if (!props.busy) emit('close')
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) emit('upload', file)
}
</script>

<style scoped>
.avatar-overlay {
  position: fixed;
  inset: 0;
  z-index: 110;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--overlay-bg);
}

.avatar-dialog {
  width: min(360px, 100%);
  max-height: min(90vh, 560px);
  overflow-y: auto;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: var(--modal-shadow);
}

.avatar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--line);
}

.avatar-header h2 {
  margin: 0;
  color: var(--ink);
  font-size: 14px;
  font-weight: 600;
}

.avatar-heading {
  display: flex;
  align-items: center;
  gap: 10px;
}

.avatar-heading img {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  object-fit: cover;
}

.close-button {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ink-2);
  cursor: pointer;
}

.close-button:hover {
  background: var(--bg-2);
}

.avatar-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
}

.avatar-content :deep(.avatar-preset-picker) {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  max-height: none;
}

.file-input {
  display: none;
}

.upload-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 38px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--bg-2);
  color: var(--ink);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}

.upload-button:hover:not(:disabled) {
  border-color: var(--blue-2);
}

.upload-button:disabled,
.close-button:disabled {
  cursor: wait;
  opacity: 0.6;
}

.avatar-error {
  margin: 0;
  color: var(--danger-ink);
  font-size: 12px;
}
</style>
