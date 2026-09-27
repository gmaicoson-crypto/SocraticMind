<template>
  <Teleport to="body">
    <Transition name="slide">
      <div v-if="show" class="manager-overlay" @click.self="emit('close')">
        <div class="manager-panel">
          <div class="panel-header">
            <div>
              <div class="panel-title">我的主题</div>
              <div class="panel-sub">管理你的学习主题</div>
            </div>
            <IconButton class="close-btn" label="关闭主题管理" @click="emit('close')">✕</IconButton>
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
                  <div class="topic-name">{{ topic.title }}</div>
                  <div class="topic-stats">{{ topic.mastered }} / {{ topic.nodes }} 节点已掌握</div>
                  <ProgressBar
                    class="topic-track"
                    :value="topic.nodes ? (topic.mastered / topic.nodes) * 100 : 0"
                    :label="`${topic.title}掌握进度`"
                  />
                </div>
              </div>
              <IconButton
                class="delete-btn"
                label="删除主题"
                :loading="deleting === topic.id"
                @click="handleDelete(topic.id, topic.title)"
              >
                <template #loading><span class="spinner" /></template>
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                >
                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                </svg>
              </IconButton>
            </div>

            <EmptyState v-if="store.topics.length === 0" class="empty-state">
              <div class="empty-text">还没有主题，在对话框告诉 AI 你想学什么吧！</div>
            </EmptyState>
          </div>

          <Transition name="fade">
            <div v-if="confirmId" class="confirm-bar">
              <span>确定删除「{{ confirmTitle }}」吗？</span>
              <div class="confirm-btns">
                <BaseButton class="confirm-cancel" @click="confirmId = null">取消</BaseButton>
                <BaseButton class="confirm-ok" @click="doDelete">删除</BaseButton>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
// TopicManager 组件，封装局部界面和交互逻辑。
import { ref } from 'vue'
import { useLearningStore } from '../../stores/learning'
import { deleteTopic } from '../../api/topic'
import BaseButton from '../ui/BaseButton.vue'
import EmptyState from '../ui/EmptyState.vue'
import IconButton from '../ui/IconButton.vue'
import ProgressBar from '../ui/ProgressBar.vue'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ close: [] }>()

const store = useLearningStore()
const deleting = ref<string | null>(null)
const confirmId = ref<string | null>(null)
const confirmTitle = ref('')

function selectTopic(id: string) {
  store.setActiveTopic(id)
  emit('close')
}

function handleDelete(id: string, title: string) {
  confirmId.value = id
  confirmTitle.value = title
}

async function doDelete() {
  if (!confirmId.value) return
  const id = confirmId.value
  deleting.value = id
  confirmId.value = null
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
  } catch (err) {
    console.error('删除失败', err)
  } finally {
    deleting.value = null
  }
}
</script>

<style scoped>
.manager-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.3);
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
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.12);
}

.panel-header {
  padding: 20px 18px 16px;
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(180deg, var(--bg-2), var(--surface));
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
  border-radius: 8px;
  background: transparent;
  border: 1px solid var(--line);
  color: var(--ink-3);
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  font-family: var(--font-sans);
}
.close-btn:hover {
  background: var(--bg-3);
  color: var(--ink);
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
  background: var(--surface);
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

.topic-name {
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
  border-radius: 7px;
  background: transparent;
  border: 1px solid transparent;
  color: var(--ink-3);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s;
}
.delete-btn:hover {
  background: #fcebeb;
  border-color: #f7c1c1;
  color: #e24b4a;
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

.confirm-bar {
  padding: 12px 16px;
  border-top: 1px solid var(--line);
  background: #fcebeb;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12.5px;
  color: #a32d2d;
  flex-shrink: 0;
}

.confirm-btns {
  display: flex;
  gap: 6px;
}

.confirm-cancel {
  padding: 5px 12px;
  border-radius: 7px;
  border: 1px solid #f7c1c1;
  background: white;
  color: #a32d2d;
  font-size: 12px;
  cursor: pointer;
  font-family: var(--font-sans);
}

.confirm-ok {
  padding: 5px 12px;
  border-radius: 7px;
  border: none;
  background: #e24b4a;
  color: white;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  font-family: var(--font-sans);
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

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
