<template>
  <div class="topic-bar">
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
    </svg>
    <template v-if="editing">
      <input
        ref="inputRef"
        :value="editingValue"
        class="topic-name-input"
        @input="$emit('update:editingValue', ($event.target as HTMLInputElement).value)"
        @keydown.enter="$emit('save')"
        @keydown.escape="$emit('cancel')"
      />
      <button class="topic-ctrl-btn confirm" @click="$emit('save')">✓</button>
      <button class="topic-ctrl-btn cancel" @click="$emit('cancel')">✕</button>
    </template>
    <template v-else>
      <span class="topic-bar-name">{{ topicTitle }}</span>
      <button class="topic-edit-btn" title="修改主题名称" @click="$emit('startEdit')">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'

const props = defineProps<{
  topicTitle: string
  editing: boolean
  editingValue: string
}>()

defineEmits<{
  (e: 'startEdit'): void
  (e: 'save'): void
  (e: 'cancel'): void
  (e: 'update:editingValue', val: string): void
}>()

const inputRef = ref<HTMLInputElement | null>(null)
// 进入编辑态自动聚焦
watch(() => props.editing, (val) => {
  if (val) nextTick(() => inputRef.value?.focus())
})
</script>

<style scoped>
.topic-bar {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 14px; flex-shrink: 0;
  background: var(--blue-tint); border-bottom: 1px solid var(--blue-line);
  font-size: 11.5px; color: var(--ink-2);
}
.topic-bar-name {
  font-weight: 500; color: var(--ink); flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.topic-name-input {
  flex: 1; font-size: 12px; padding: 2px 8px;
  border: 1px solid var(--blue); border-radius: 4px;
  outline: none; background: var(--surface); color: var(--ink);
  font-family: var(--font-sans);
}
.topic-edit-btn {
  background: transparent; border: none; cursor: pointer;
  color: var(--ink-3); padding: 2px 4px; border-radius: 4px;
  display: flex; align-items: center;
}
.topic-edit-btn:hover { background: var(--surface); color: var(--ink); }
.topic-ctrl-btn {
  width: 22px; height: 22px; border: 1px solid var(--line);
  background: var(--surface); border-radius: 4px; cursor: pointer;
  font-size: 11px; display: flex; align-items: center; justify-content: center;
}
.topic-ctrl-btn.confirm { color: var(--blue-2); }
.topic-ctrl-btn.confirm:hover { background: var(--blue-tint); border-color: var(--blue-line); }
.topic-ctrl-btn.cancel { color: var(--ink-3); }
.topic-ctrl-btn.cancel:hover { background: var(--bg-3); color: var(--ink); }
</style>
