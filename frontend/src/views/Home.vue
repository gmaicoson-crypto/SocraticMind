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
// Home 页面组件，承载对应页面的主要交互。
import { ref, defineAsyncComponent } from 'vue'
import TopBar from '../components/TopBar.vue'
import Sidebar from '../components/Sidebar.vue'
import SocraticDialogue from '../components/SocraticDialogue.vue'

const KnowledgeGraph = defineAsyncComponent(() => import('../components/KnowledgeGraph.vue'))
const NotesPanel = defineAsyncComponent(() => import('../components/NotesPanel.vue'))
import { useLearningStore } from '../stores/learning'
import { useResizablePane } from '../composables/useResizablePane'
import { useStudyTimer } from '../composables/useStudyTimer'

const store = useLearningStore()
const rightPanel = ref<'graph' | 'notes'>('graph')

function setRightPanel(panel: 'graph' | 'notes') {
  rightPanel.value = panel
}

const mainRef = ref<HTMLElement | null>(null)
const { leftWidth, dragging, startDrag } = useResizablePane(mainRef)
useStudyTimer(() => store.userInfo?.id)
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
.divider.dragging {
  background: var(--blue-tint);
}
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
.divider.dragging .divider-handle span {
  background: var(--blue-2);
}
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
.right-tab:hover {
  background: var(--bg-3);
  color: var(--ink);
}
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
