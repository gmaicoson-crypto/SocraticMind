<template>
  <Transition name="slide-left">
    <div v-if="show" ref="panelRef" class="history-panel">
      <div class="history-header">
        <span class="history-title">{{
          chatMode === 'socratic' ? '学习对话历史' : '普通对话历史'
        }}</span>
        <IconButton class="history-close" label="关闭对话历史" @click="$emit('close')">
          <X :size="14" aria-hidden="true" />
        </IconButton>
      </div>
      <div class="history-list">
        <div
          v-for="session in sessions"
          :key="session.id"
          :data-session-id="session.id"
          class="history-item"
          :class="{ active: currentSessionId === session.id }"
          @click="$emit('switch', session.id)"
        >
          <img
            class="history-avatar"
            :src="avatarSrc(session.aiAvatarUrl ?? fallbackAvatarUrl)"
            alt=""
            loading="lazy"
            decoding="async"
          />
          <div class="history-item-content">
            <div class="history-name-wrap">
              <span class="history-name" :title="session.name">{{ session.name }}</span>
            </div>
            <TimeDisplay class="history-time" :value="session.updatedAt" />
          </div>
          <span class="history-count">{{ messageCount(session) }} 条</span>
          <div class="history-item-actions" @click.stop>
            <IconButton
              v-if="session.messages.some((message) => message.role === 'user')"
              class="history-action-btn"
              label="重命名"
              @click.stop="$emit('startEdit', session)"
            >
              <Pencil :size="13" aria-hidden="true" />
            </IconButton>
            <IconButton
              class="history-action-btn delete"
              label="删除"
              @click.stop="$emit('delete', session.id)"
            >
              <Trash2 :size="13" aria-hidden="true" />
            </IconButton>
          </div>
        </div>
      </div>
      <button class="history-new-btn ui-icon-surface" @click="$emit('newSession')">
        <Plus :size="13" aria-hidden="true" />
        新建对话
      </button>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { Pencil, Plus, Trash2, X } from '@lucide/vue'
// DialogueHistoryPanel 组件，封装局部界面和交互逻辑。
import { ref } from 'vue'
import IconButton from '../ui/IconButton.vue'
import TimeDisplay from '../ui/TimeDisplay.vue'
import type { DialogueSession } from '../../types'
import { avatarSrc } from '../../utils/avatar'
import { isWelcomeMessage } from '../../composables/useChatSessions'

const props = defineProps<{
  show: boolean
  chatMode: 'socratic' | 'normal'
  sessions: DialogueSession[]
  fallbackAvatarUrl: string
  currentSessionId: string
}>()

defineEmits<{
  (e: 'close'): void
  (e: 'switch', id: string): void
  (e: 'newSession'): void
  (e: 'startEdit', session: DialogueSession): void
  (e: 'delete', id: string): void
}>()

const panelRef = ref<HTMLDivElement | null>(null)

function focusAction(id: string, action: 'rename' | 'delete') {
  const row = Array.from(panelRef.value?.querySelectorAll<HTMLElement>('.history-item') ?? []).find(
    (item) => item.dataset.sessionId === id,
  )
  const label = action === 'rename' ? '重命名' : '删除'
  const button = row?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  const trigger = button ?? panelRef.value?.querySelector<HTMLButtonElement>('.history-close')
  trigger?.focus()
}

defineExpose({ focusAction })

function messageCount(session: DialogueSession): number {
  return session.messages.reduce((count, message) => count + Number(!isWelcomeMessage(message)), 0)
}
</script>

<style scoped>
.history-panel {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 100%;
  max-width: 360px;
  background: var(--surface);
  border-right: 1px solid var(--line);
  z-index: 50;
  display: flex;
  flex-direction: column;
}
.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}
.history-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink);
}

.history-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.history-item {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) 36px 46px;
  align-items: center;
  gap: 4px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
  min-height: 48px;
}
.history-item:hover {
  background: var(--bg-2);
}
.history-item.active {
  background: var(--blue-tint);
}
.history-item-content {
  grid-column: 2;
  min-width: 0;
}
.history-avatar {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 7px;
  object-fit: cover;
}
.history-name-wrap {
  min-width: 0;
}
.history-name {
  display: block;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--ink);
  line-height: 18px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.history-count {
  grid-column: 3;
  align-self: start;
  line-height: 18px;
  font-size: 10px;
  color: var(--ink-3);
  font-family: var(--font-mono);
  white-space: nowrap;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.history-time {
  display: block;
  font-size: 10px;
  color: var(--ink-3);
  font-family: var(--font-mono);
  margin-top: 2px;
  line-height: 14px;
}

.history-item-actions {
  grid-column: 4;
  display: flex;
  gap: 2px;
  justify-content: flex-end;
  width: 46px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s;
}
.history-item:hover .history-item-actions,
.history-item:focus-within .history-item-actions {
  opacity: 1;
}
.history-action-btn {
  width: 22px;
  height: 22px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.history-action-btn.delete:hover {
  --icon-color: currentColor;
  color: var(--danger-hover-ink);
}

.history-new-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 8px;
  padding: 8px 12px;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  font-family: var(--font-sans);
  transition: background 0.15s;
  flex-shrink: 0;
}

.slide-left-enter-active,
.slide-left-leave-active {
  transition:
    transform 0.2s ease,
    opacity 0.2s ease;
}
.slide-left-enter-from,
.slide-left-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}
</style>
