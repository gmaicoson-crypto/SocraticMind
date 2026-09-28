<template>
  <section class="memory-section">
    <header class="memory-header">
      <div>
        <p>Learning context</p>
        <h2>Agent 记忆</h2>
      </div>
      <BaseButton class="add-button" :disabled="memories.mutating" @click="openCreate">
        <span aria-hidden="true">＋</span> 新增记忆
      </BaseButton>
    </header>

    <div v-if="memories.loading" class="memory-state">正在加载记忆</div>
    <div
      v-else-if="memories.error && memories.memories.length === 0"
      class="memory-state error-state"
    >
      <span>{{ memories.error.message }}</span>
      <BaseButton @click="memories.fetchMemories()">重试</BaseButton>
    </div>
    <div v-else class="memory-groups">
      <section v-for="group in groups" :key="group.kind" class="memory-group">
        <div class="group-heading">
          <h3>{{ group.label }}</h3>
          <span>{{ group.items.length }}</span>
        </div>
        <p v-if="group.items.length === 0" class="group-empty">暂无</p>
        <article v-for="memory in group.items" :key="memory.id" class="memory-item">
          <p>{{ memory.content }}</p>
          <div class="memory-meta">
            <span>{{ sourceLabel(memory.source) }}</span>
            <span>{{ scopeLabel(memory.topic_id) }}</span>
            <time :datetime="memory.updated_at">{{ formatDate(memory.updated_at) }}</time>
          </div>
          <div class="memory-actions">
            <button
              type="button"
              title="编辑记忆"
              :disabled="memories.mutating"
              @click="openEdit(memory)"
            >
              ✎
            </button>
            <button
              type="button"
              title="删除记忆"
              :disabled="memories.mutating"
              @click="deletingMemory = memory"
            >
              ×
            </button>
          </div>
        </article>
      </section>
    </div>
    <p v-if="memories.error && memories.memories.length" class="memory-inline-error">
      {{ memories.error.message }}
    </p>

    <BaseModal
      :model-value="editor !== null"
      :close-disabled="memories.mutating"
      @close="closeEditor"
      @update:model-value="
        (value) => {
          if (!value) closeEditor()
        }
      "
    >
      <div class="memory-overlay" @click.self="closeEditor">
        <form class="memory-dialog" @submit.prevent="saveMemory">
          <header>
            <div>
              <p>Agent 记忆</p>
              <h2>{{ editor?.id ? '编辑记忆' : '新增记忆' }}</h2>
            </div>
            <button type="button" title="关闭" :disabled="memories.mutating" @click="closeEditor">
              ×
            </button>
          </header>
          <label>
            <span>类型</span>
            <select v-model="form.kind" name="kind">
              <option v-for="kind in memoryKinds" :key="kind.value" :value="kind.value">
                {{ kind.label }}
              </option>
            </select>
          </label>
          <label>
            <span>主题作用域</span>
            <select v-model="form.topicId" name="topic_id">
              <option value="">全部主题</option>
              <option v-for="topic in learning.topics" :key="topic.id" :value="topic.id">
                {{ topic.title }}
              </option>
            </select>
          </label>
          <label>
            <span>内容</span>
            <BaseInput v-model="form.content" name="content" maxlength="300" required />
            <small>{{ form.content.length }} / 300</small>
          </label>
          <p v-if="memories.error" class="dialog-error">{{ memories.error.message }}</p>
          <div class="dialog-actions">
            <BaseButton :disabled="memories.mutating" @click="closeEditor">取消</BaseButton>
            <BaseButton class="primary" type="submit" :loading="memories.mutating">
              <template #loading>保存中</template>
              保存
            </BaseButton>
          </div>
        </form>
      </div>
    </BaseModal>

    <ConfirmDialog
      :model-value="deletingMemory !== null"
      title="删除这条 Agent 记忆？"
      confirm-text="确认删除"
      :loading="memories.mutating"
      @close="deletingMemory = null"
      @update:model-value="
        (value) => {
          if (!value) deletingMemory = null
        }
      "
      @confirm="confirmDelete"
    >
      删除后，后续对话将不再使用这条记忆。
      <p v-if="memories.error" class="dialog-error">{{ memories.error.message }}</p>
    </ConfirmDialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useLearningStore } from '../../stores/learning'
import { useMemoriesStore } from '../../stores/memories'
import type { Memory, MemoryKind, MemorySource } from '../../types/learningAgent'
import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'
import BaseModal from '../ui/BaseModal.vue'
import ConfirmDialog from '../ui/ConfirmDialog.vue'

const memoryKinds: { value: MemoryKind; label: string }[] = [
  { value: 'goal', label: '目标' },
  { value: 'background', label: '背景' },
  { value: 'preference', label: '偏好' },
  { value: 'strength', label: '优势' },
  { value: 'weakness', label: '薄弱点' },
]
const learning = useLearningStore()
const memories = useMemoriesStore()
const editor = ref<Memory | { id: null } | null>(null)
const deletingMemory = ref<Memory | null>(null)
const form = reactive({ kind: 'goal' as MemoryKind, topicId: '', content: '' })
const groups = computed(() =>
  memoryKinds.map((kind) => ({
    kind: kind.value,
    label: kind.label,
    items: memories.memories.filter((memory) => memory.kind === kind.value),
  })),
)

onMounted(() => {
  memories.fetchMemories()
})

function openCreate() {
  form.kind = 'goal'
  form.topicId = ''
  form.content = ''
  editor.value = { id: null }
}

function openEdit(memory: Memory) {
  form.kind = memory.kind
  form.topicId = memory.topic_id == null ? '' : String(memory.topic_id)
  form.content = memory.content
  editor.value = memory
}

function closeEditor() {
  if (!memories.mutating) editor.value = null
}

async function saveMemory() {
  const content = form.content.trim()
  if (!editor.value || !content) return
  const input = {
    kind: form.kind,
    topic_id: form.topicId ? Number(form.topicId) : null,
    content,
  }
  const saved = editor.value.id
    ? await memories.editMemory(editor.value.id, input)
    : await memories.addMemory(input)
  if (saved) editor.value = null
}

async function confirmDelete() {
  const memoryId = deletingMemory.value?.id
  if (!memoryId) return
  const deleted = await memories.removeMemory(memoryId)
  if (deleted !== null) deletingMemory.value = null
}

function sourceLabel(source: MemorySource) {
  return { user: '用户提供', diagnostic: '诊断生成', assessment: '评估生成' }[source]
}

function scopeLabel(topicId: number | null) {
  if (topicId == null) return '全部主题'
  return learning.topics.find((topic) => Number(topic.id) === topicId)?.title ?? `主题 ${topicId}`
}

function formatDate(value: string) {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString()
}
</script>

<style scoped>
.memory-section {
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  padding: 18px 0 20px;
  color: var(--ink);
}
.memory-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 14px;
}
.memory-header p,
.memory-dialog header p {
  margin: 0 0 3px;
  color: var(--blue-2);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}
.memory-header h2,
.memory-dialog header h2 {
  margin: 0;
  font-size: 15px;
  letter-spacing: 0;
}
.add-button,
.memory-state :deep(.ui-button),
.dialog-actions :deep(.ui-button) {
  min-height: 32px;
  padding: 0 11px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--bg-2);
  color: var(--ink-2);
  cursor: pointer;
}
.memory-groups {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
}
.memory-group {
  min-width: 0;
  padding: 12px;
  background: var(--surface);
}
.memory-group + .memory-group {
  border-left: 1px solid var(--line);
}
.group-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.group-heading h3 {
  margin: 0;
  font-size: 12px;
}
.group-heading span {
  color: var(--ink-3);
  font-size: 10px;
}
.group-empty {
  margin: 12px 0;
  color: var(--ink-3);
  font-size: 11px;
}
.memory-item {
  position: relative;
  min-width: 0;
  padding: 10px 42px 10px 0;
  border-top: 1px solid var(--line);
}
.memory-item > p {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
.memory-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 7px;
  margin-top: 6px;
  color: var(--ink-3);
  font-size: 9.5px;
}
.memory-actions {
  position: absolute;
  top: 8px;
  right: 0;
  display: flex;
  gap: 2px;
}
.memory-actions button,
.memory-dialog header button {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ink-3);
  cursor: pointer;
}
.memory-actions button:hover {
  color: var(--blue-2);
  background: var(--bg-2);
}
.memory-state {
  display: grid;
  place-items: center;
  gap: 10px;
  min-height: 140px;
  color: var(--ink-3);
  font-size: 12px;
}
.error-state,
.dialog-error {
  color: var(--danger-strong);
}
.memory-inline-error {
  margin: 9px 0 0;
  color: var(--danger-strong);
  font-size: 11px;
  overflow-wrap: anywhere;
}
.memory-overlay {
  position: fixed;
  inset: 0;
  z-index: 400;
  display: grid;
  place-items: center;
  padding: 20px;
  background: var(--overlay-medium);
  backdrop-filter: blur(4px);
}
.memory-dialog {
  display: grid;
  gap: 13px;
  width: min(440px, 100%);
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: var(--shadow-modal-sm);
}
.memory-dialog header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.memory-dialog label {
  display: grid;
  gap: 5px;
  min-width: 0;
  color: var(--ink-2);
  font-size: 11px;
}
.memory-dialog select,
.memory-dialog :deep(.ui-input) {
  width: 100%;
  min-width: 0;
  height: 36px;
  box-sizing: border-box;
  padding: 0 9px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--bg);
  color: var(--ink);
}
.memory-dialog small {
  justify-self: end;
  color: var(--ink-3);
}
.dialog-error {
  margin: 0;
  font-size: 11px;
  overflow-wrap: anywhere;
}
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.dialog-actions :deep(.primary) {
  border-color: var(--blue-2);
  background: var(--blue-2);
  color: var(--on-accent);
}
@media (max-width: 1100px) {
  .memory-groups {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .memory-group + .memory-group {
    border-left: 0;
    border-top: 1px solid var(--line);
  }
  .memory-group:nth-child(2) {
    border-top: 0;
    border-left: 1px solid var(--line);
  }
  .memory-group:nth-child(4) {
    border-left: 1px solid var(--line);
  }
}
@media (max-width: 620px) {
  .memory-groups {
    grid-template-columns: minmax(0, 1fr);
  }
  .memory-group:nth-child(2) {
    border-top: 1px solid var(--line);
    border-left: 0;
  }
  .memory-group:nth-child(4) {
    border-left: 0;
  }
  .memory-header {
    align-items: flex-start;
  }
}
</style>
