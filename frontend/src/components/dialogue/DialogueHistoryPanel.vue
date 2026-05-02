<template>
  <Transition name="slide-left">
    <div v-if="show" class="history-panel">
      <div class="history-header">
        <span class="history-title">{{ chatMode === 'socratic' ? '学习对话历史' : '普通对话历史' }}</span>
        <button class="history-close" @click="$emit('close')">✕</button>
      </div>
      <div class="history-list">
        <div
          v-for="session in sessions"
          :key="session.id"
          class="history-item"
          :class="{ active: currentSessionId === session.id }"
          @click="$emit('switch', session.id)"
        >
          <div class="history-item-content">
            <div v-if="editingSessionId === session.id" class="history-edit">
              <input
                ref="editInputRef"
                :value="editingName"
                class="history-name-input"
                @input="$emit('update:editingName', ($event.target as HTMLInputElement).value)"
                @keydown.enter="$emit('saveName', session.id)"
                @keydown.escape="$emit('cancelEdit')"
                @click.stop
              />
              <button class="history-save-btn" @click.stop="$emit('saveName', session.id)">✓</button>
              <button class="history-cancel-btn" @click.stop="$emit('cancelEdit')">✕</button>
            </div>
            <div v-else class="history-name-wrap">
              <span class="history-name">{{ session.name }}</span>
              <span class="history-count">{{ session.messages.length - 1 }} 条</span>
            </div>
            <div class="history-time">{{ session.updatedAt }}</div>
          </div>
          <div v-if="editingSessionId !== session.id" class="history-item-actions" @click.stop>
            <button class="history-action-btn" title="重命名" @click.stop="$emit('startEdit', session)">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="history-action-btn delete" title="删除" @click.stop="$emit('delete', session.id)">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
      <button class="history-new-btn" @click="$emit('newSession')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        新建对话
      </button>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import type { Message } from '../../types'

interface Session {
  id: string
  name: string
  messages: Message[]
  updatedAt: string
  topicId?: number
  topicTitle?: string
}

const props = defineProps<{
  show: boolean
  chatMode: 'socratic' | 'normal'
  sessions: Session[]
  currentSessionId: string
  editingSessionId: string | null
  editingName: string
}>()

defineEmits<{
  (e: 'close'): void
  (e: 'switch', id: string): void
  (e: 'newSession'): void
  (e: 'startEdit', session: Session): void
  (e: 'cancelEdit'): void
  (e: 'saveName', id: string): void
  (e: 'delete', id: string): void
  (e: 'update:editingName', val: string): void
}>()

const editInputRef = ref<HTMLInputElement | null>(null)

// 进入编辑态时自动聚焦输入框
watch(() => props.editingSessionId, (id) => {
  if (id) nextTick(() => editInputRef.value?.focus())
})
</script>

<style scoped>
.history-panel {
  position: absolute; top: 0; left: 0; bottom: 0; width: 260px;
  background: var(--surface); border-right: 1px solid var(--line);
  z-index: 50; display: flex; flex-direction: column;
}
.history-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px; border-bottom: 1px solid var(--line); flex-shrink: 0;
}
.history-title { font-size: 12.5px; font-weight: 600; color: var(--ink); }
.history-close {
  background: transparent; border: none; cursor: pointer;
  color: var(--ink-3); font-size: 14px; padding: 2px 6px; border-radius: 4px;
}
.history-close:hover { background: var(--bg-3); color: var(--ink); }

.history-list {
  flex: 1; min-height: 0; overflow-y: auto; padding: 6px;
  display: flex; flex-direction: column; gap: 4px;
}
.history-item {
  display: flex; align-items: center; gap: 4px;
  padding: 8px 10px; border-radius: 8px; cursor: pointer;
  transition: background .15s; min-height: 48px;
}
.history-item:hover { background: var(--bg-2); }
.history-item.active { background: var(--blue-tint); }
.history-item-content { flex: 1; min-width: 0; }
.history-name-wrap { display: flex; align-items: center; gap: 6px; }
.history-name {
  font-size: 12.5px; font-weight: 500; color: var(--ink); flex: 1;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.history-count {
  font-size: 10px; color: var(--ink-3); font-family: var(--font-mono); flex-shrink: 0;
}
.history-time {
  font-size: 10px; color: var(--ink-3); font-family: var(--font-mono); margin-top: 2px;
}

.history-edit { display: flex; align-items: center; gap: 4px; }
.history-name-input {
  flex: 1; min-width: 0;
  font-size: 12px; padding: 3px 6px; border: 1px solid var(--blue);
  border-radius: 4px; outline: none; background: var(--surface); color: var(--ink);
  font-family: var(--font-sans);
}
.history-save-btn, .history-cancel-btn {
  width: 22px; height: 22px; border: 1px solid var(--line);
  background: var(--bg-2); border-radius: 4px; cursor: pointer;
  font-size: 11px; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.history-save-btn { color: var(--blue-2); }
.history-save-btn:hover { background: var(--blue-tint); border-color: var(--blue-line); }
.history-cancel-btn { color: var(--ink-3); }
.history-cancel-btn:hover { background: var(--bg-3); color: var(--ink); }

.history-item-actions { display: flex; gap: 2px; flex-shrink: 0; opacity: 0; transition: opacity .15s; }
.history-item:hover .history-item-actions { opacity: 1; }
.history-action-btn {
  width: 22px; height: 22px; border: none; background: transparent;
  border-radius: 4px; cursor: pointer; color: var(--ink-3);
  display: flex; align-items: center; justify-content: center;
}
.history-action-btn:hover { background: var(--bg-3); color: var(--ink); }
.history-action-btn.delete:hover { color: #c14545; }

.history-new-btn {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  margin: 8px; padding: 8px 12px; background: var(--blue-2); color: white;
  border: none; border-radius: 8px; font-size: 12.5px; font-weight: 500; cursor: pointer;
  font-family: var(--font-sans); transition: background .15s; flex-shrink: 0;
}
.history-new-btn:hover { background: var(--blue); }

.slide-left-enter-active, .slide-left-leave-active { transition: transform .2s ease, opacity .2s ease; }
.slide-left-enter-from, .slide-left-leave-to { transform: translateX(-100%); opacity: 0; }
</style>
