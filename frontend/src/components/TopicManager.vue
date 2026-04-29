<template>
  <Teleport to="body">
    <Transition name="slide">
      <div v-if="show" class="manager-overlay" @click.self="emit('close')">
        <div class="manager-panel">

          <!-- 头部 -->
          <div class="panel-header">
            <div>
              <div class="panel-title">我的主题</div>
              <div class="panel-sub">管理你的学习主题</div>
            </div>
            <button class="close-btn" @click="emit('close')">✕</button>
          </div>

          <!-- 主题列表 -->
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
                  <div class="topic-stats">
                    {{ topic.mastered }} / {{ topic.nodes }} 节点已掌握
                  </div>
                  <!-- 进度条 -->
                  <div class="topic-track">
                    <div
                      class="topic-fill"
                      :style="{ width: (topic.nodes ? topic.mastered / topic.nodes * 100 : 0) + '%' }"
                    />
                  </div>
                </div>
              </div>
              <button
                class="delete-btn"
                :disabled="deleting === topic.id"
                @click="handleDelete(topic.id, topic.title)"
              >
                <svg v-if="deleting !== topic.id" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
                </svg>
                <span v-else class="spinner" />
              </button>
            </div>

            <!-- 空状态 -->
            <div v-if="store.topics.length === 0" class="empty-state">
              <div class="empty-text">还没有主题，在对话框告诉 AI 你想学什么吧！</div>
            </div>
          </div>

          <!-- 删除确认 -->
          <Transition name="fade">
            <div v-if="confirmId" class="confirm-bar">
              <span>确定删除「{{ confirmTitle }}」吗？</span>
              <div class="confirm-btns">
                <button class="confirm-cancel" @click="confirmId = null">取消</button>
                <button class="confirm-ok" @click="doDelete">删除</button>
              </div>
            </div>
          </Transition>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useLearningStore } from '../stores/learning'
import { deleteTopic } from '../api/topic'

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
    // 如果删的是当前主题，清空节点和图谱
    if (store.activeTopicId === id) {
      if (store.topics.length > 0) {
        await store.setActiveTopic(store.topics[0].id)
      } else {
        // 没有主题了，清空所有数据
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
  background: rgba(0,0,0,0.3);
  backdrop-filter: blur(2px);
}

.manager-panel {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 320px;
  background: var(--surface);
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  box-shadow: 4px 0 24px rgba(0,0,0,0.12);
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
  width: 28px; height: 28px;
  border-radius: 8px;
  background: transparent;
  border: 1px solid var(--line);
  color: var(--ink-3);
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all .15s;
  font-family: var(--font-sans);
}
.close-btn:hover { background: var(--bg-3); color: var(--ink); }

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
  transition: all .15s;
}
.topic-item:hover { border-color: var(--blue-line); }
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
  width: 36px; height: 36px;
  border-radius: 10px;
  background: var(--bg-2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}

.topic-info { flex: 1; min-width: 0; }

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

.topic-fill {
  height: 100%;
  background: var(--blue-2);
  border-radius: 99px;
  transition: width .4s;
}

.delete-btn {
  width: 28px; height: 28px;
  border-radius: 7px;
  background: transparent;
  border: 1px solid transparent;
  color: var(--ink-3);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all .15s;
}
.delete-btn:hover {
  background: #FCEBEB;
  border-color: #F7C1C1;
  color: #E24B4A;
}
.delete-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.spinner {
  width: 12px; height: 12px;
  border-radius: 50%;
  border: 2px solid var(--line);
  border-top-color: var(--blue-2);
  animation: spin .7s linear infinite;
  display: inline-block;
}
@keyframes spin { to { transform: rotate(360deg); } }

.empty-state {
  padding: 32px 16px;
  text-align: center;
}
.empty-text {
  font-size: 12.5px;
  color: var(--ink-3);
  line-height: 1.6;
}

/* 删除确认条 */
.confirm-bar {
  padding: 12px 16px;
  border-top: 1px solid var(--line);
  background: #FCEBEB;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12.5px;
  color: #A32D2D;
  flex-shrink: 0;
}

.confirm-btns { display: flex; gap: 6px; }

.confirm-cancel {
  padding: 5px 12px;
  border-radius: 7px;
  border: 1px solid #F7C1C1;
  background: white;
  color: #A32D2D;
  font-size: 12px;
  cursor: pointer;
  font-family: var(--font-sans);
}

.confirm-ok {
  padding: 5px 12px;
  border-radius: 7px;
  border: none;
  background: #E24B4A;
  color: white;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  font-family: var(--font-sans);
}

/* 动画 */
.slide-enter-active,
.slide-leave-active {
  transition: opacity .2s ease;
}
.slide-enter-active .manager-panel,
.slide-leave-active .manager-panel {
  transition: transform .25s ease;
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
.fade-leave-active { transition: opacity .2s; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }
</style>