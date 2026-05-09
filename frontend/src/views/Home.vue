<template>
  <div class="app-shell">
    <TopBar />
    <div class="app-body">
      <Sidebar />
      <main class="app-main" ref="mainRef">

        <div class="dialogue-col" :style="{ width: leftWidth + 'px' }">
          <SocraticDialogue />
        </div>

        <div
          class="divider"
          :class="{ dragging }"
          @mousedown="startDrag"
        >
          <div class="divider-handle">
            <span /><span /><span />
          </div>
        </div>

        <div class="right-col">
          <div class="right-tabs">
            <button
              class="right-tab"
              :class="{ active: rightPanel === 'graph' }"
              @click="setRightPanel('graph')"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/>
                <path d="M12 7v4M12 11L5 17M12 11L19 17"/>
              </svg>
              知识图谱
            </button>
            <button
              class="right-tab"
              :class="{ active: rightPanel === 'notes' }"
              @click="setRightPanel('notes')"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M4 6H20M4 12H20M4 18H14"/>
              </svg>
              笔记与画布
            </button>
          </div>

          <div class="right-panel">
            <!-- v-if + 异步组件：首次显示时才下载/挂载，KeepAlive 缓存已加载的实例 -->
            <KeepAlive>
              <KnowledgeGraph v-if="rightPanel === 'graph'" />
              <NotesPanel v-else-if="rightPanel === 'notes'" />
            </KeepAlive>
          </div>
        </div>

      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, defineAsyncComponent } from 'vue'
import { addStudyMinutes } from '../utils/dailyGoal'
import TopBar from '../components/TopBar.vue'
import Sidebar from '../components/Sidebar.vue'
import SocraticDialogue from '../components/SocraticDialogue.vue'
// KnowledgeGraph 含 confetti + 大量 SVG 计算；NotesPanel 含 marked + 画布
// 异步加载让首屏 JS 体积下降，并配合 keep-alive 切 tab 时不重复加载
const KnowledgeGraph = defineAsyncComponent(() => import('../components/KnowledgeGraph.vue'))
const NotesPanel = defineAsyncComponent(() => import('../components/NotesPanel.vue'))
import { useLearningStore } from '../stores/learning'

const store = useLearningStore()
const rightPanel = ref<'graph' | 'notes'>('graph')

function setRightPanel(panel: 'graph' | 'notes') {
  rightPanel.value = panel
}

const mainRef = ref<HTMLElement | null>(null)
const leftWidth = ref(0)
const dragging = ref(false)

const MIN_LEFT = 320
const MIN_RIGHT = 380
const DIVIDER_W = 10

// 学习时长计时：1Hz 计时器；2 分钟无操作判定为 inactive 暂停计时
let studyTimer: ReturnType<typeof setInterval> | null = null
let studySeconds = 0

const INACTIVE_TIMEOUT = 2 * 60 * 1000
const ACTIVE_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll']
// 仅记录时间戳，避免每次 mousemove 都 clearTimeout/setTimeout
let lastActiveAt = Date.now()

function startStudyTimer() {
  if (studyTimer) return
  studyTimer = setInterval(() => {
    // 在计时器内判定活跃，避免事件回调高频开销
    if (Date.now() - lastActiveAt > INACTIVE_TIMEOUT) return
    studySeconds++
    if (studySeconds % 60 === 0 && store.userInfo?.id) {
      addStudyMinutes(store.userInfo.id, 1)
    }
  }, 1000)
}

function stopStudyTimer() {
  if (!studyTimer) return
  clearInterval(studyTimer)
  studyTimer = null
  // 不足 1 分钟但超过 30 秒按 1 分钟入账
  const remaining = Math.floor(studySeconds % 60)
  if (remaining >= 30 && store.userInfo?.id) {
    addStudyMinutes(store.userInfo.id, 1)
  }
}

function onUserActive() {
  lastActiveAt = Date.now()
}

function handleVisibilityChange() {
  // 切回前台视为一次活跃，防止误判 inactive 漏计时
  if (!document.hidden) onUserActive()
}

onMounted(async () => {
  startStudyTimer()
  onUserActive()
  document.addEventListener('visibilitychange', handleVisibilityChange)
  ACTIVE_EVENTS.forEach(e => window.addEventListener(e, onUserActive, { passive: true }))

  if (mainRef.value) {
    const total = mainRef.value.clientWidth - DIVIDER_W - 28
    leftWidth.value = Math.round(total * 0.45)
  }

  // fetchTopics 已在 App.vue onMounted 中调用，此处不重复请求
})

onBeforeUnmount(() => {
  stopStudyTimer()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  ACTIVE_EVENTS.forEach(e => window.removeEventListener(e, onUserActive))
})

function startDrag(e: MouseEvent) {
  dragging.value = true
  e.preventDefault()
  const startX = e.clientX
  const startWidth = leftWidth.value

  function onMove(e: MouseEvent) {
    if (!mainRef.value) return
    const totalW = mainRef.value.clientWidth - DIVIDER_W - 28
    const delta = e.clientX - startX
    const newLeft = startWidth + delta
    leftWidth.value = Math.min(Math.max(newLeft, MIN_LEFT), totalW - MIN_RIGHT)
  }

  function onUp() {
    dragging.value = false
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }

  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}
</script>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}
.app-body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.app-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: stretch;
  padding: 14px;
  min-height: 0;
  height: 100%;
}
.dialogue-col {
  flex-shrink: 0;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.divider {
  width: 10px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: col-resize;
  margin: 0 4px;
  border-radius: 4px;
  transition: background .15s;
  user-select: none;
}
.divider:hover,
.divider.dragging { background: var(--blue-tint); }
.divider-handle {
  display: flex;
  flex-direction: column;
  gap: 3px;
  pointer-events: none;
}
.divider-handle span {
  display: block;
  width: 2px;
  height: 16px;
  background: var(--line-2);
  border-radius: 2px;
  transition: background .15s;
}
.divider:hover .divider-handle span,
.divider.dragging .divider-handle span { background: var(--blue-2); }
.right-col {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}
.right-tabs {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  padding: 4px;
}
.right-tab {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 12px;
  font-size: 12.5px;
  font-weight: 500;
  background: transparent;
  color: var(--ink-2);
  border: none;
  border-radius: 7px;
  cursor: pointer;
  font-family: var(--font-sans);
  transition: all .15s;
}
.right-tab:hover { background: var(--bg-3); color: var(--ink); }
.right-tab.active {
  background: var(--surface);
  color: var(--blue-2);
  box-shadow: 0 1px 0 var(--line), 0 1px 3px oklch(0.5 0.04 235 / 0.08);
}
.right-panel {
  flex: 1;
  min-height: 0;
  position: relative;
}
.right-panel > * {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
</style>