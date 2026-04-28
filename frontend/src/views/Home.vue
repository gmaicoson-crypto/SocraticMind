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
              @click="rightPanel = 'graph'"
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
              @click="rightPanel = 'notes'"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M4 6H20M4 12H20M4 18H14"/>
              </svg>
              笔记与画布
            </button>
          </div>

          <div class="right-panel">
            <KnowledgeGraph v-show="rightPanel === 'graph'" />
            <NotesPanel v-show="rightPanel === 'notes'" />
          </div>
        </div>

      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import TopBar from '../components/TopBar.vue'
import Sidebar from '../components/Sidebar.vue'
import SocraticDialogue from '../components/SocraticDialogue.vue'
import NotesPanel from '../components/NotesPanel.vue'
import KnowledgeGraph from '../components/KnowledgeGraph.vue'

const rightPanel = ref<'graph' | 'notes'>('graph')
const mainRef = ref<HTMLElement | null>(null)
const leftWidth = ref(0)
const dragging = ref(false)

const MIN_LEFT = 320
const MIN_RIGHT = 380
const DIVIDER_W = 10

onMounted(() => {
  if (mainRef.value) {
    const total = mainRef.value.clientWidth - DIVIDER_W - 28
    leftWidth.value = Math.round(total * 0.45)
  }
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

onBeforeUnmount(() => {
  dragging.value = false
})
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