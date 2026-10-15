<template>
  <div class="dlg-header">
    <div class="dlg-header-left">
      <button
        type="button"
        class="ai-avatar"
        :class="{ thinking: isThinking }"
        title="更改此对话的 AI 头像"
        aria-label="更改此对话的 AI 头像"
        @click="emit('avatar')"
      >
        <img :src="avatarSrc(aiAvatarUrl)" alt="" class="ui-avatar-image ai-avatar-image" />
        <span v-if="isThinking" class="thinking-dot" />
      </button>
      <div class="dlg-heading">
        <div class="dlg-title-row">
          <div class="dlg-title" :title="currentSessionTitle">
            {{ currentSessionTitle }}
          </div>
          <button
            ref="renameButton"
            type="button"
            class="session-name-edit ui-name-edit"
            :title="canRenameCurrentSession ? '编辑对话名称' : '发送消息后可编辑对话名称'"
            aria-label="编辑对话名称"
            :disabled="!canRenameCurrentSession || savingSessionName"
            @click="emit('rename')"
          >
            <Pencil :size="13" class="icon-inherit" aria-hidden="true" />
          </button>
        </div>
        <div
          class="dlg-sub"
          :title="currentSessionSubtitle"
          :role="currentSessionNode ? undefined : 'status'"
        >
          {{ currentSessionSubtitle }}
        </div>
        <div v-if="isThinking && currentSessionNode" class="dlg-status" role="status">
          {{ dialogueStatus }}
        </div>
      </div>
    </div>
    <div class="dlg-actions">
      <button
        class="hdr-btn ui-icon-button"
        title="对话历史"
        :disabled="assessmentActive"
        @click="emit('history')"
      >
        <History :size="13" aria-hidden="true" />
      </button>
      <button
        class="hdr-btn ui-icon-button"
        title="新建对话"
        :disabled="assessmentActive"
        @click="emit('newSession')"
      >
        <Plus :size="13" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { History, Pencil, Plus } from '@lucide/vue'
import { avatarSrc } from '../../utils/avatar'
defineProps<{
  aiAvatarUrl: string
  isThinking: boolean
  currentSessionTitle: string
  canRenameCurrentSession?: boolean
  savingSessionName: boolean
  currentSessionSubtitle: string
  currentSessionNode?: unknown
  dialogueStatus: string
  assessmentActive: boolean
}>()
const emit = defineEmits<{ rename: []; avatar: []; history: []; newSession: [] }>()
const renameButton = ref<HTMLButtonElement | null>(null)
defineExpose({ focus: () => renameButton.value?.focus() })
</script>
<style scoped>
.dlg-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--header-gradient);
  flex-shrink: 0;
}

.dlg-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.dlg-heading {
  min-width: 0;
}

.ai-avatar {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 10px;
  background: var(--ai-avatar-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: visible;
  border: 0;
  padding: 0;
  cursor: pointer;
}

.ai-avatar:focus-visible {
  outline: 2px solid var(--blue-2);
  outline-offset: 2px;
}

.ai-avatar-image {
  border-radius: inherit;
}

.thinking-dot {
  position: absolute;
  right: -3px;
  bottom: -3px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--green);
  border: 2px solid var(--surface);
}

.dlg-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.dlg-title {
  min-width: 0;
  font-weight: 600;
  font-size: 13.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.dlg-sub,
.dlg-status {
  font-size: 11px;
  color: var(--ink-3);
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dlg-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.hdr-btn {
  width: 28px;
  height: 28px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.hdr-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
