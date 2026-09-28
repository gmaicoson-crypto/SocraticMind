<template>
  <aside class="sidebar">
    <TopicManager v-if="hasOpenedManager" :show="showManager" @close="showManager = false" />

    <div class="section">
      <div class="section-header">
        <span class="section-title">我的主题</span>
        <div class="header-btns">
          <button class="manage-btn" title="管理主题" @click="openManager()">
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </button>
          <button
            class="theme-btn"
            :title="store.isDark ? '切换到明亮' : '切换到黑暗'"
            @click="store.toggleTheme"
          >
            <svg
              v-if="store.isDark"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <circle cx="12" cy="12" r="4" />
              <path
                d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
              />
            </svg>
            <svg
              v-else
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          </button>
        </div>
      </div>

      <div class="topic-list">
        <button
          v-for="topic in visibleTopics"
          :key="topic.id"
          class="topic-row"
          :class="{ active: store.activeTopicId === topic.id }"
          @click="store.setActiveTopic(topic.id)"
        >
          <div class="topic-main">
            <span class="topic-emoji" :class="{ 'emoji-active': store.activeTopicId === topic.id }">
              {{ topic.emoji }}
            </span>
            <div class="topic-info">
              <div class="topic-title">{{ topic.title }}</div>
              <div class="topic-count">{{ topic.mastered }} / {{ topic.nodes }} 节点</div>
            </div>
          </div>
          <div class="prog-track">
            <div
              class="prog-fill"
              :class="{ 'fill-active': store.activeTopicId === topic.id }"
              :style="{ width: (topic.nodes ? (topic.mastered / topic.nodes) * 100 : 0) + '%' }"
            />
          </div>
        </button>

        <button v-if="showMoreTopics" class="expand-btn" @click="openManager()">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
          还有 {{ store.topics.length - MAX_VISIBLE }} 个主题
        </button>

        <div v-if="store.topics.length === 0" class="empty-topics">在对话框告诉 AI 你想学什么</div>
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <span class="section-title">推荐</span>
        <button
          class="manage-btn"
          title="刷新推荐"
          :disabled="isRefreshing"
          @click="refreshRecommend"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            :style="{ animation: isRefreshing ? 'spin .7s linear infinite' : 'none' }"
          >
            <path d="M1 4v6h6M23 20v-6h-6" />
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
          </svg>
        </button>
      </div>

      <div v-if="store.recommendations.length === 0 || isRefreshing" class="rec-empty">
        <span class="rec-loading">{{
          isRefreshing ? 'AI 正在重新推荐…' : 'AI 正在分析推荐…'
        }}</span>
      </div>

      <div v-else class="recommend-list">
        <button
          v-for="r in store.recommendations"
          :key="r.title"
          class="recommend-row"
          :disabled="store.agentSubmitting"
          @click="handleRecommend(r.title)"
        >
          <span class="rec-emoji">{{ r.emoji }}</span>
          <div>
            <div class="rec-title">{{ r.title }}</div>
            <div class="rec-reason">{{ r.reason }}</div>
          </div>
        </button>
      </div>
    </div>

    <div class="streak-card">
      <div class="streak-header">
        <span style="font-size: 18px">✦</span>
        <span class="streak-label">连续学习</span>
      </div>
      <div class="streak-days">
        <span class="streak-num">{{ store.streakData.streak }}</span>
        <span class="streak-unit">天</span>
      </div>
      <div class="streak-bars">
        <div
          v-for="i in 31"
          :key="i"
          class="streak-bar"
          :title="getBarTitle(i)"
          :style="getBarStyle(i)"
        />
      </div>
      <div class="streak-total">累计学习 {{ store.streakData.total_days }} 天</div>
    </div>

    <Transition name="toast">
      <div v-if="showToast" class="toast">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
        {{ toastMsg }}
      </div>
    </Transition>
  </aside>
</template>

<script setup lang="ts">
// Sidebar 组件，封装局部界面和交互逻辑。
import { ref, computed, onBeforeUnmount, defineAsyncComponent } from 'vue'
import { useLearningStore } from '../stores/learning'

const TopicManager = defineAsyncComponent(() => import('./navigation/TopicManager.vue'))

const store = useLearningStore()
const showManager = ref(false)

const hasOpenedManager = ref(false)

function openManager() {
  hasOpenedManager.value = true
  showManager.value = true
}
const MAX_VISIBLE = 3
const visibleTopics = computed(() => store.topics.slice(0, MAX_VISIBLE))
const showMoreTopics = computed(() => store.topics.length > MAX_VISIBLE)

const toastMsg = ref('')
const showToast = ref(false)
let toastTimer: ReturnType<typeof setTimeout> | null = null
const isRefreshing = ref(false)

function showToastMsg(msg: string) {
  toastMsg.value = msg
  showToast.value = true
  if (toastTimer) clearTimeout(toastTimer)
  if (!msg.includes('请稍等')) {
    toastTimer = setTimeout(() => {
      showToast.value = false
    }, 2500)
  }
}

async function refreshRecommend() {
  if (isRefreshing.value) return
  isRefreshing.value = true
  try {
    await store.fetchRecommendations()
  } finally {
    isRefreshing.value = false
  }
}

function handleRecommend(title: string) {
  const opened = store.openOnboarding(title)
  showToastMsg(opened ? `请完善《${title}》的学习目标` : '请先完成当前学习流程')
}

function getBarStyle(i: number) {
  const streak = store.streakData.streak
  const lit = streak % 31 === 0 && streak > 0 ? 31 : streak % 31
  const isLit = i <= lit

  if (!isLit) {
    return { background: 'var(--bg-3)', opacity: '0.4' }
  }

  const ratio = i / 31
  const intensity = Math.round(55 + ratio * 45)
  return {
    background: `color-mix(in oklch, var(--blue) ${intensity}%, var(--surface))`,
    opacity: '1',
  }
}

function getBarTitle(i: number) {
  const streak = store.streakData.streak
  const lit = streak % 31 === 0 && streak > 0 ? 31 : streak % 31
  if (i > lit) return `未达到第 ${i} 天`
  const cycleStart = Math.floor(streak / 31) * 31
  const actualDay = cycleStart + i
  return `连续学习第 ${actualDay} 天`
}

onBeforeUnmount(() => {
  if (toastTimer) clearTimeout(toastTimer)
})
</script>

<style scoped>
.sidebar {
  width: 232px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 14px;
  background: var(--bg-2);
  border-right: 1px solid var(--line);
  overflow-y: auto;
  transition:
    background 0.3s,
    border-color 0.3s;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px 8px;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-3);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-family: var(--font-mono);
  flex: 1;
}

.header-btns {
  display: flex;
  align-items: center;
  gap: 5px;
}

.manage-btn {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 7px;
  color: var(--ink-3);
  cursor: pointer;
  transition: all 0.15s;
}
.manage-btn:hover {
  background: var(--blue-tint);
  border-color: var(--blue-line);
  color: var(--blue-2);
}

.theme-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-3);
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--ink-2);
  cursor: pointer;
  transition: all 0.15s;
}
.theme-btn:hover {
  background: var(--blue-tint);
  border-color: var(--blue-line);
  color: var(--blue-2);
}

.topic-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.empty-topics {
  font-size: 11.5px;
  color: var(--ink-3);
  text-align: center;
  padding: 16px 8px;
  line-height: 1.6;
}

.topic-row {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
  font-family: var(--font-sans);
}
.topic-row:hover {
  background: var(--bg-3);
}
.topic-row.active {
  background: var(--blue-tint);
  border-color: var(--blue-line);
}

.topic-main {
  display: flex;
  align-items: center;
  gap: 9px;
}

.topic-emoji {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-3);
  color: var(--ink-2);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  flex-shrink: 0;
  transition: background 0.15s;
}
.emoji-active {
  background: var(--blue-2);
  color: var(--on-accent);
}

.topic-info {
  flex: 1;
  min-width: 0;
}

.topic-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.topic-count {
  font-size: 10.5px;
  color: var(--ink-3);
  font-family: var(--font-mono);
  margin-top: 1px;
}

.prog-track {
  height: 3px;
  background: var(--bg-3);
  border-radius: 999px;
  overflow: hidden;
}
.prog-fill {
  height: 100%;
  background: var(--blue);
  border-radius: 999px;
  transition: width 0.4s;
}
.fill-active {
  background: var(--blue-2);
}

.expand-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 7px;
  background: transparent;
  border: 1px dashed var(--line);
  border-radius: 8px;
  color: var(--ink-3);
  font-size: 11.5px;
  font-weight: 500;
  font-family: var(--font-sans);
  cursor: pointer;
  transition: all 0.15s;
  margin-top: 2px;
}
.expand-btn:hover {
  background: var(--blue-tint);
  border-color: var(--blue-line);
  color: var(--blue-2);
}

.recommend-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.recommend-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--surface);
  border: 1px dashed var(--line-2);
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  font-family: var(--font-sans);
  transition: background 0.15s;
}
.recommend-row:hover {
  background: var(--bg-3);
}

.rec-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--blue);
  flex-shrink: 0;
}

.rec-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--ink);
}

.rec-count {
  font-size: 10.5px;
  color: var(--ink-3);
  font-family: var(--font-mono);
  margin-top: 1px;
}

.rec-emoji {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
  background: var(--bg-2);
  border-radius: 8px;
}

.rec-reason {
  font-size: 10px;
  color: var(--ink-3);
  margin-top: 1px;
  font-family: var(--font-mono);
}

.rec-empty {
  padding: 12px 8px;
  text-align: center;
}

.rec-loading {
  font-size: 11.5px;
  color: var(--ink-3);
}

.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--toast-bg);
  color: var(--on-accent);
  font-size: 13px;
  font-weight: 500;
  padding: 10px 16px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 999;
  white-space: nowrap;
  box-shadow: var(--toast-shadow);
  font-family: var(--font-sans);
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(10px);
}

.streak-total {
  font-size: 10.5px;
  color: var(--ink-3);
  font-family: var(--font-mono);
  margin-top: 6px;
  text-align: right;
}

.streak-card {
  margin-top: auto;
  padding: 12px;
  background: var(--blue-tint);
  border: 1px solid var(--blue-line);
  border-radius: 10px;
  transition: background 0.3s;
}

.streak-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.streak-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--blue-2);
}

.streak-days {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.streak-num {
  font-size: 22px;
  font-weight: 700;
  color: var(--ink);
}

.streak-unit {
  font-size: 11px;
  color: var(--ink-3);
}

.streak-bars {
  display: flex;
  gap: 2px;
  margin-top: 8px;
}

.streak-bar {
  flex: 1;
  height: 12px;
  border-radius: 2px;
  transition:
    background 0.3s,
    opacity 0.3s;
  cursor: default;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
