<template>
  <div class="graph-wrap">
    <div class="graph-header">
      <div>
        <div class="graph-label">Knowledge Graph</div>
        <div class="graph-title">
          {{ currentTopicTitle }}
          <span class="graph-count">· {{ store.totalCount }} 节点</span>
        </div>
      </div>
      <GraphLegend
        :mastered="store.masteredCount"
        :available="store.availableCount"
        :locked="store.totalCount - store.masteredCount - store.availableCount"
      />
    </div>

    <ThreeGraphCanvas
      ref="graphRef"
      :nodes="store.nodes"
      :edges="store.edges"
      :selected-id="store.activeNode?.id"
      :theme-key="store.isDark ? 'dark' : 'light'"
      @select="handleClick"
    />

    <div v-if="store.totalCount === 0" class="empty-graph">
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--ink-3)"
        stroke-width="1"
      >
        <circle cx="12" cy="5" r="2" />
        <circle cx="5" cy="19" r="2" />
        <circle cx="19" cy="19" r="2" />
        <path d="M12 7v4M12 11L5 17M12 11L19 17" />
      </svg>
      <div class="empty-title">暂无知识图谱</div>
      <div class="empty-sub">在左侧对话框告诉 AI 你想学什么</div>
    </div>

    <canvas ref="confettiCanvasRef" class="confetti-canvas" />

    <div class="controls">
      <button class="ctrl-btn" title="居中" @click="resetView">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M3 12h3M18 12h3M12 3v3M12 18v3" />
        </svg>
      </button>
      <button class="ctrl-btn" title="放大" @click="zoomIn">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <button class="ctrl-btn" title="缩小" @click="zoomOut">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M5 12h14" />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
// KnowledgeGraph 组件，封装局部界面和交互逻辑。
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useLearningStore } from '../stores/learning'
import type { KNode } from '../types'
import ThreeGraphCanvas from './graph/ThreeGraphCanvas.vue'
import GraphLegend from './graph/GraphLegend.vue'
import { themeColors } from '../utils/theme'

const store = useLearningStore()
const graphRef = ref<InstanceType<typeof ThreeGraphCanvas> | null>(null)
const confettiCanvasRef = ref<HTMLCanvasElement | null>(null)

const currentTopicTitle = computed(() => {
  const t = store.topics.find((t) => t.id === store.activeTopicId)
  return t?.title ?? 'Knowledge Graph'
})

let confettiInstance: any = null

const masteredNodes = computed(() => store.nodes.filter((n) => n.state === 'mastered'))

function getNodeScreenPos(node: KNode) {
  return graphRef.value?.getNodeScreenPos(node) ?? { x: 0.5, y: 0.5 }
}

function resetView() {
  graphRef.value?.resetView()
}

function zoomIn() {
  graphRef.value?.zoomIn()
}

function zoomOut() {
  graphRef.value?.zoomOut()
}

function fireConfettiAt(node: KNode) {
  if (!confettiInstance) return
  const pos = getNodeScreenPos(node)
  confettiInstance({
    particleCount: 38,
    spread: 65,
    startVelocity: 24,
    origin: pos,
    colors: themeColors([
      '--confetti-color-1',
      '--confetti-color-2',
      '--confetti-color-3',
      '--confetti-color-4',
      '--confetti-color-5',
    ]),
    gravity: 0.9,
    scalar: 0.75,
    ticks: 120,
  })
}

function fireCelebration() {
  if (!confettiInstance) return
  confettiInstance({
    particleCount: 100,
    spread: 120,
    origin: { x: 0.5, y: 0.3 },
    colors: themeColors([
      '--confetti-color-1',
      '--confetti-color-2',
      '--confetti-color-3',
      '--confetti-color-4',
      '--confetti-color-5',
      '--confetti-color-6',
      '--confetti-color-7',
    ]),
    startVelocity: 35,
    gravity: 0.8,
    scalar: 0.9,
    ticks: 200,
  })
  setTimeout(() => {
    confettiInstance({
      particleCount: 60,
      spread: 80,
      origin: { x: 0.2, y: 0.4 },
      colors: themeColors(['--confetti-color-1', '--confetti-color-6', '--confetti-color-8']),
      startVelocity: 28,
      gravity: 0.8,
      scalar: 0.75,
      ticks: 160,
    })
  }, 250)
  setTimeout(() => {
    confettiInstance({
      particleCount: 60,
      spread: 80,
      origin: { x: 0.8, y: 0.4 },
      colors: themeColors(['--confetti-color-2', '--confetti-color-7', '--confetti-color-9']),
      startVelocity: 28,
      gravity: 0.8,
      scalar: 0.75,
      ticks: 160,
    })
  }, 500)
}

onMounted(() => {
  if (confettiCanvasRef.value && (window as any).confetti) {
    confettiInstance = (window as any).confetti.create(confettiCanvasRef.value, {
      resize: true,
      useWorker: false,
    })
  }

  initialConfettiTimer = setTimeout(() => {
    masteredNodes.value.forEach((n, i) => {
      const t = setTimeout(() => fireConfettiAt(n), i * 220)
      pendingConfettiTimers.push(t)
    })
  }, 600)
})

let initialConfettiTimer: ReturnType<typeof setTimeout> | null = null
const pendingConfettiTimers: ReturnType<typeof setTimeout>[] = []

onBeforeUnmount(() => {
  if (initialConfettiTimer) clearTimeout(initialConfettiTimer)
  pendingConfettiTimers.forEach(clearTimeout)
})

watch(
  () => store.nodes.filter((n) => n.state === 'mastered').map((n) => n.id),
  (newIds, oldIds) => {
    const oldSet = new Set(oldIds)
    for (const id of newIds) {
      if (oldSet.has(id)) continue
      const node = store.nodes.find((n) => n.id === id)
      if (node) setTimeout(() => fireConfettiAt(node), 50)
    }
  },
)

watch(
  () => store.activeTopicId,
  () => resetView(),
)

watch(
  () => store.lastMasteredId,
  (id) => {
    if (!id) return
    const node = store.nodes.find((n) => n.id === id)
    if (node) {
      fireConfettiAt(node)
      const allMastered = store.nodes.length > 0 && store.nodes.every((n) => n.state === 'mastered')
      if (allMastered) {
        setTimeout(() => fireCelebration(), 400)
      }
    }
  },
)

function handleClick(node: KNode) {
  store.setActiveNode(node)
}
</script>

<style scoped>
.graph-wrap {
  position: relative;
  flex: 1;
  background: var(--graph-bg);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow:
    0 1px 0 var(--line),
    var(--graph-shadow);
}

.graph-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 14px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 5;
  background: var(--graph-header-bg);
}

.graph-label {
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--ink-3);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.graph-title {
  font-size: 15px;
  font-weight: 600;
  margin-top: 2px;
}

.graph-count {
  color: var(--ink-3);
  font-weight: 400;
  font-size: 13px;
}

.legend-wrap {
  display: flex;
  gap: 8px;
  align-items: center;
}

.empty-graph {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.empty-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--ink-2);
}

.empty-sub {
  font-size: 12.5px;
  color: var(--ink-3);
}

.confetti-canvas {
  position: absolute;
  inset: 0;
  pointer-events: none;
  width: 100%;
  height: 100%;
}

.controls {
  position: absolute;
  bottom: 14px;
  right: 14px;
  display: flex;
  gap: 4px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 4px;
}

.ctrl-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--ink-2);
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.ctrl-btn:hover {
  background: var(--bg-3);
}
@media (max-width: 500px) {
  .graph-header {
    align-items: stretch;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
  }
  .graph-title {
    font-size: 14px;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
  .graph-header :deep(.legend-wrap) {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    width: 100%;
  }
  .graph-header :deep(.legend-item) {
    justify-content: center;
    gap: 4px;
    min-width: 0;
    padding: 4px 6px;
    font-size: 10.5px;
    white-space: nowrap;
  }
}
</style>
