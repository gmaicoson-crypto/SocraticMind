<template>
  <div class="avatar-row">
    <button
      type="button"
      class="big-avatar"
      aria-label="上传用户头像"
      :disabled="uploading"
      @click="triggerUpload"
    >
      <img :src="avatarPreview" alt="" class="avatar-img ui-avatar-image" decoding="async" />
      <div class="avatar-edit">
        <Pencil :size="10" class="icon-inherit" aria-hidden="true" />
      </div>
    </button>
    <input
      ref="fileInput"
      type="file"
      accept="image/png,image/jpeg,image/gif,image/webp"
      style="display: none"
      @change="emit('upload', $event)"
    />
    <div class="avatar-actions">
      <button class="avatar-action-btn" :disabled="uploading" @click="triggerUpload">
        {{ uploading ? '上传中…' : '上传图片' }}
      </button>
      <button class="avatar-action-btn ghost" :disabled="uploading" @click="emit('random')">
        随机头像
      </button>
    </div>
  </div>
  <div class="avatar-hint">用户头像</div>
  <AvatarPresetPicker
    label="用户头像"
    :options="userAvatarPresets"
    :model-value="modelValue"
    :disabled="uploading"
    @select="emit('update:modelValue', $event)"
  />
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { Pencil } from '@lucide/vue'
import AvatarPresetPicker from './AvatarPresetPicker.vue'
import { userAvatarPresets } from '../../utils/avatarPresets'
defineProps<{ modelValue: string; avatarPreview: string; uploading: boolean }>()
const emit = defineEmits<{
  'update:modelValue': [value: string]
  upload: [event: Event]
  random: []
}>()
const fileInput = ref<HTMLInputElement | null>(null)
function triggerUpload() {
  fileInput.value?.click()
}
</script>
<style scoped>
.avatar-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 16px;
}

.big-avatar {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  border: 0;
  padding: 0;
  cursor: pointer;
  transition: filter 0.15s;
}

.big-avatar:hover {
  filter: brightness(0.9);
}

.avatar-img {
  border-radius: 16px;
}

.avatar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.avatar-action-btn {
  font-size: 11.5px;
  padding: 5px 10px;
  border-radius: 7px;
  background: var(--blue-2);
  color: var(--on-accent);
  border: none;
  cursor: pointer;
  font-family: var(--font-sans);
  transition: opacity 0.15s;
}

.avatar-action-btn:hover:not(:disabled) {
  opacity: 0.85;
}

.avatar-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.avatar-action-btn.ghost {
  background: transparent;
  color: var(--ink-2);
  border: 1px solid var(--line);
}

.avatar-edit {
  color: var(--on-accent);
  position: absolute;
  bottom: -4px;
  right: -4px;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  background: var(--blue-2);
  border: 2px solid var(--surface);
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-edit svg {
  width: 10px;
  height: 10px;
}

.avatar-hint {
  font-size: 11px;
  color: var(--ink-3);
  margin-bottom: 6px;
}
</style>
