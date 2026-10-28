<template>
  <Teleport to="body">
    <Transition name="slide">
      <div v-if="show" class="manager-overlay" @click.self="closeManager">
        <div class="manager-panel">
          <div class="panel-header">
            <div>
              <div class="panel-title">我的主题</div>
              <div class="panel-sub">管理你的学习主题</div>
            </div>
            <IconButton
              class="close-btn"
              label="关闭主题管理"
              :disabled="busy"
              @click="closeManager"
              >✕</IconButton
            >
          </div>

          <div class="topic-list">
            <div
              v-for="topic in store.topics"
              :key="topic.id"
              class="topic-item"
              :class="{ active: store.activeTopicId === topic.id }"
            >
              <div class="topic-left" @click="selectTopic(topic.id)">
                <div class="topic-emoji">{{ topic.emoji }}</div>
                <div class="topic-info">
                  <div class="topic-name" :title="topic.title">{{ topic.title }}</div>
                  <div class="topic-stats">{{ topic.mastered }} / {{ topic.nodes }} 节点已掌握</div>
                  <ProgressBar
                    class="topic-track"
                    :value="topic.nodes ? (topic.mastered / topic.nodes) * 100 : 0"
                    :label="`${topic.title}掌握进度`"
                  />
                </div>
              </div>
              <div class="topic-actions">
                <IconButton
                  label="管理学习资料"
                  :disabled="busy"
                  @click="materialTopicId = Number(topic.id)"
                >
                  <BookOpen :size="13" aria-hidden="true" />
                </IconButton>
                <IconButton
                  label="编辑主题名称"
                  :disabled="busy"
                  @click="startRename(topic.id, topic.title, $event)"
                >
                  <Pencil :size="13" aria-hidden="true" />
                </IconButton>
                <IconButton
                  class="delete-btn"
                  label="删除主题"
                  :loading="deleting === topic.id"
                  :disabled="busy"
                  @click="handleDelete(topic.id, topic.title)"
                >
                  <template #loading><span class="spinner" /></template>
                  <Trash2 :size="13" aria-hidden="true" />
                </IconButton>
              </div>
            </div>

            <EmptyState v-if="store.topics.length === 0" class="empty-state">
              <div class="empty-text">还没有主题，在对话框告诉 AI 你想学什么吧！</div>
            </EmptyState>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
  <ConfirmDialog
    :model-value="show && editingId !== null"
    title="编辑主题名称"
    confirm-text="保存名称"
    loading-text="保存中…"
    :loading="savingName"
    @close="cancelRename"
    @update:model-value="(value) => !value && cancelRename()"
    @confirm="saveTopicName"
  >
    <label class="ui-name-field">
      <span>主题名称</span>
      <input
        ref="nameInputRef"
        v-model="editingName"
        type="text"
        maxlength="200"
        :disabled="savingName"
        :aria-invalid="Boolean(renameError)"
        :aria-describedby="renameError ? 'topic-name-error' : undefined"
        @input="renameError = ''"
        @keydown.enter="saveTopicNameOnEnter"
      />
    </label>
    <p v-if="renameError" id="topic-name-error" class="ui-name-error" role="alert">
      {{ renameError }}
    </p>
  </ConfirmDialog>
  <ConfirmDialog
    :model-value="show && confirmId !== null"
    title="删除主题？"
    confirm-text="确定删除"
    loading-text="删除中…"
    :loading="deleting !== null"
    @close="cancelDelete"
    @update:model-value="(value) => !value && cancelDelete()"
    @confirm="doDelete"
  >
    <p class="delete-message">确定删除「{{ confirmTitle }}」吗？此操作无法撤销。</p>
    <p v-if="deleteError" class="delete-error" role="alert">{{ deleteError }}</p>
  </ConfirmDialog>
  <TopicMaterialsDialog
    v-if="show && materialTopicId !== null"
    :key="materialTopicId"
    :topic-id="materialTopicId"
    @close="closeMaterials"
    @busy="materialsSaving = $event"
  />
</template>

<script setup lang="ts">
import { BookOpen, Pencil, Trash2 } from '@lucide/vue'
import TopicMaterialsDialog from '../agent/TopicMaterialsDialog.vue'
// TopicManager 组件，封装局部界面和交互逻辑。
import { computed, nextTick, ref, watch } from 'vue'
import { useLearningStore } from '../../stores/learning'
import { deleteTopic, updateTopicTitle } from '../../api/topic'
import { parseApiError } from '../../api'
import ConfirmDialog from '../ui/ConfirmDialog.vue'
import EmptyState from '../ui/EmptyState.vue'
import IconButton from '../ui/IconButton.vue'
import ProgressBar from '../ui/ProgressBar.vue'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ close: [] }>()

const store = useLearningStore()
const deleting = ref<string | null>(null)
const confirmId = ref<string | null>(null)
const confirmTitle = ref('')
const deleteError = ref('')
const editingId = ref<string | null>(null)
const editingName = ref('')
const savingName = ref(false)
const renameError = ref('')
const nameInputRef = ref<HTMLInputElement | null>(null)
const materialTopicId = ref<number | null>(null)
const materialsSaving = ref(false)
const busy = computed(() => deleting.value !== null || savingName.value || materialsSaving.value)
let renameTrigger: HTMLButtonElement | null = null

function closeMaterials() {
  materialTopicId.value = null
  materialsSaving.value = false
}

function startRename(id: string, title: string, event: MouseEvent) {
  if (busy.value || editingId.value !== null || confirmId.value !== null) return
  renameTrigger = event.currentTarget as HTMLButtonElement
  editingId.value = id
  editingName.value = title
  renameError.value = ''
  nextTick(() => {
    nameInputRef.value?.focus()
    nameInputRef.value?.select()
  })
}

function cancelRename() {
  if (savingName.value) return
  const trigger = renameTrigger
  editingId.value = null
  editingName.value = ''
  renameError.value = ''
  renameTrigger = null
  nextTick(() => {
    if (props.show) trigger?.focus()
  })
}

function saveTopicNameOnEnter(event: KeyboardEvent) {
  if (event.isComposing) return
  event.preventDefault()
  void saveTopicName()
}

async function saveTopicName() {
  if (editingId.value === null || busy.value) return
  const id = editingId.value
  const title = editingName.value.trim()
  if (!title) {
    renameError.value = '请输入主题名称'
    return
  }
  if (title.length > 200) {
    renameError.value = '主题名称不能超过 200 个字符'
    return
  }
  if (store.topics.find((topic) => topic.id === id)?.title === title) {
    cancelRename()
    return
  }
  savingName.value = true
  renameError.value = ''
  let saved = false
  try {
    const updated = await updateTopicTitle(Number(id), title)
    store.topics = store.topics.map((topic) =>
      topic.id === id ? { ...topic, title: updated.title } : topic,
    )
    saved = true
  } catch (err) {
    renameError.value = `修改主题名称失败：${parseApiError(err).message}`
  } finally {
    savingName.value = false
    if (saved || !props.show) cancelRename()
  }
}

function cancelDelete() {
  if (deleting.value !== null) return
  confirmId.value = null
  confirmTitle.value = ''
  deleteError.value = ''
}

function closeManager() {
  if (busy.value) return
  cancelDelete()
  cancelRename()
  materialTopicId.value = null
  emit('close')
}

watch(
  () => props.show,
  (show) => {
    if (!show) {
      materialTopicId.value = null
      materialsSaving.value = false
      cancelDelete()
      cancelRename()
    }
  },
)

function selectTopic(id: string) {
  if (busy.value || editingId.value !== null || confirmId.value !== null) return
  store.setActiveTopic(id)
  closeManager()
}

function handleDelete(id: string, title: string) {
  if (busy.value || editingId.value !== null || confirmId.value !== null) return
  confirmId.value = id
  confirmTitle.value = title
  deleteError.value = ''
}

async function doDelete() {
  if (!confirmId.value || busy.value) return
  const id = confirmId.value
  deleting.value = id
  deleteError.value = ''
  let deleted = false
  try {
    await deleteTopic(Number(id))
    await store.fetchTopics()

    if (store.activeTopicId === id) {
      if (store.topics.length > 0) {
        await store.setActiveTopic(store.topics[0].id)
      } else {
        store.clearGraph()
      }
    }
    deleted = true
  } catch (err) {
    deleteError.value = `删除主题失败：${parseApiError(err).message}`
  } finally {
    deleting.value = null
    if (deleted || !props.show) cancelDelete()
  }
}
</script>

<style scoped>
.manager-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: var(--overlay-bg);
  backdrop-filter: blur(2px);
}

.manager-panel {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 320px;
  background: var(--surface);
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  box-shadow: var(--panel-shadow);
}

.panel-header {
  padding: 20px 18px 16px;
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--header-gradient);
  flex-shrink: 0;
}

.panel-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--ink);
}

.panel-sub {
  font-size: 11.5px;
  color: var(--ink-3);
  margin-top: 2px;
}

.close-btn {
  width: 28px;
  height: 28px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  font-family: var(--font-sans);
}

.topic-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.topic-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--surface-raised);
  transition: all 0.15s;
}
.topic-item:hover {
  border-color: var(--blue-line);
}
.topic-item.active {
  background: var(--blue-tint);
  border-color: var(--blue-line);
}

.topic-left {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  min-width: 0;
}

.topic-emoji {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--bg-2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}

.topic-info {
  flex: 1;
  min-width: 0;
}

.topic-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
}

.topic-name {
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.topic-stats {
  font-size: 10.5px;
  color: var(--ink-3);
  font-family: var(--font-mono);
  margin-top: 2px;
}

.topic-track {
  height: 3px;
  background: var(--bg-3);
  border-radius: 99px;
  margin-top: 6px;
  overflow: hidden;
}

.topic-track :deep(.ui-progress-bar__fill) {
  height: 100%;
  background: var(--blue-2);
  border-radius: 99px;
}

.delete-btn {
  width: 28px;
  height: 28px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s;
}
.delete-btn:hover {
  --icon-color: currentColor;
  background: var(--danger-button-bg);
  border-color: var(--danger-button-border);
  color: var(--danger-button-text);
}
.delete-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spinner {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--line);
  border-top-color: var(--blue-2);
  animation: spin 0.7s linear infinite;
  display: inline-block;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.empty-state {
  padding: 32px 16px;
  text-align: center;
}
.empty-text {
  font-size: 12.5px;
  color: var(--ink-3);
  line-height: 1.6;
}

.delete-message {
  margin: 0;
  overflow-wrap: anywhere;
}
.delete-error {
  margin: 8px 0 0;
  color: var(--danger-ink);
  font-size: 12px;
}

.slide-enter-active,
.slide-leave-active {
  transition: opacity 0.2s ease;
}
.slide-enter-active .manager-panel,
.slide-leave-active .manager-panel {
  transition: transform 0.25s ease;
}
.slide-enter-from .manager-panel,
.slide-leave-to .manager-panel {
  transform: translateX(-100%);
}
.slide-enter-from,
.slide-leave-to {
  opacity: 0;
}
</style>
