<template>
  <div class="app-shell">
    <TopBar />
    <div class="app-body">
      <Sidebar @recommendation-opened="mobilePane = 'dialogue'" />
      <main class="app-main" ref="mainRef">
        <div class="mobile-pane-tabs" aria-label="移动端主视图">
          <button :class="{ active: mobilePane === 'dialogue' }" @click="mobilePane = 'dialogue'">
            对话
          </button>
          <button :class="{ active: mobilePane === 'workspace' }" @click="mobilePane = 'workspace'">
            学习工具
          </button>
        </div>

        <div
          class="dialogue-col"
          :class="{ 'mobile-hidden': mobilePane !== 'dialogue' }"
          :style="{ width: leftWidth + 'px' }"
        >
          <SocraticDialogue />
        </div>

        <div class="divider" :class="{ dragging }" @mousedown="startDrag">
          <div class="divider-handle"><span /><span /><span /></div>
        </div>

        <div class="right-col" :class="{ 'mobile-hidden': mobilePane !== 'workspace' }">
          <div class="right-tabs">
            <button
              class="right-tab"
              :class="{ active: rightPanel === 'graph' }"
              @click="setRightPanel('graph')"
            >
              <Network :size="13" aria-hidden="true" />
              知识图谱
            </button>
            <button
              class="right-tab"
              :class="{ active: rightPanel === 'notes' }"
              @click="setRightPanel('notes')"
            >
              <NotebookPen :size="13" aria-hidden="true" />
              笔记与画布
            </button>
            <button
              class="right-tab"
              :class="{ active: rightPanel === 'plan' }"
              @click="setRightPanel('plan')"
            >
              <CalendarCheck :size="13" aria-hidden="true" />
              学习计划
            </button>
          </div>

          <div class="right-panel">
            <KeepAlive>
              <KnowledgeGraph v-if="rightPanel === 'graph'" />
              <NotesPanel v-else-if="rightPanel === 'notes'" />
              <TodayPlanPanel v-else @navigated="showGraphPanel" />
            </KeepAlive>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CalendarCheck, Network, NotebookPen } from '@lucide/vue'
// Home 页面组件，承载对应页面的主要交互。
import { ref, defineAsyncComponent } from 'vue'
import TopBar from '../components/TopBar.vue'
import Sidebar from '../components/Sidebar.vue'
import SocraticDialogue from '../components/SocraticDialogue.vue'

const KnowledgeGraph = defineAsyncComponent(() => import('../components/KnowledgeGraph.vue'))
const NotesPanel = defineAsyncComponent(() => import('../components/NotesPanel.vue'))
const TodayPlanPanel = defineAsyncComponent(() => import('../components/TodayPlanPanel.vue'))
import { useLearningStore } from '../stores/learning'
import { useResizablePane } from '../composables/useResizablePane'
import { useStudyTimer } from '../composables/useStudyTimer'

const store = useLearningStore()
const rightPanel = ref<'graph' | 'notes' | 'plan'>('graph')
const mobilePane = ref<'dialogue' | 'workspace'>('dialogue')

function setRightPanel(panel: 'graph' | 'notes' | 'plan') {
  rightPanel.value = panel
}

function showGraphPanel() {
  rightPanel.value = 'graph'
  mobilePane.value = 'workspace'
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
.mobile-pane-tabs {
  display: none;
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
  transition: background 0.15s;
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
  transition: background 0.15s;
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
  transition: all 0.15s;
  min-width: 0;
  white-space: nowrap;
}
.right-tab:hover {
  background: var(--bg-3);
  color: var(--ink);
}
.right-tab.active {
  background: var(--surface);
  color: var(--blue-2);
  box-shadow:
    0 1px 0 var(--line),
    var(--control-shadow);
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
@media (max-width: 900px) {
  .right-tab {
    padding-inline: 7px;
    font-size: 11.5px;
  }
  .right-tab svg {
    display: none;
  }
}
@media (max-width: 760px) {
  .app-body {
    min-width: 0;
  }
  .app-body :deep(.sidebar) {
    display: none;
  }
  .app-main {
    display: grid;
    grid-template-rows: 40px minmax(0, 1fr);
    width: 100%;
    padding: 8px;
    gap: 8px;
  }
  .mobile-pane-tabs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
    padding: 4px;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--bg-2);
  }
  .mobile-pane-tabs button {
    min-width: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--ink-2);
    font: 600 12px var(--font-sans);
    cursor: pointer;
  }
  .mobile-pane-tabs button.active {
    background: var(--surface);
    color: var(--blue-2);
    box-shadow: var(--control-shadow);
  }
  .dialogue-col,
  .right-col {
    grid-row: 2;
    width: 100% !important;
    height: 100%;
    min-width: 0;
  }
  .dialogue-col.mobile-hidden,
  .right-col.mobile-hidden {
    display: none;
  }
  .divider {
    display: none;
  }
  .right-tabs {
    min-height: 42px;
  }
  .right-tab {
    padding: 6px 4px;
    font-size: 11px;
    line-height: 1.25;
    white-space: normal;
    overflow-wrap: anywhere;
  }
}
</style>
