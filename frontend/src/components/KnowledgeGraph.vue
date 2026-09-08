<template>
  <div ref="containerRef" class="graph-wrap">

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

    <svg
      :viewBox="viewBox"
      preserveAspectRatio="xMidYMid meet"
      class="graph-svg"
      ref="svgRef"
    >
      <defs>
        <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M 32 0 L 0 0 0 32" fill="none" stroke="var(--line)" stroke-width="0.5" opacity="0.5" />
        </pattern>
        <radialGradient id="masteredGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="oklch(0.72 0.085 235 / 0.18)" />
          <stop offset="100%" stop-color="oklch(0.72 0.085 235 / 0)" />
        </radialGradient>
      </defs>

      <rect
        :x="viewBoxParts[0]"
        :y="viewBoxParts[1]"
        :width="viewBoxParts[2]"
        :height="viewBoxParts[3]"
        fill="url(#grid)"
      />

      <circle
        v-for="n in masteredNodes"
        :key="`glow-${n.id}`"
        :cx="n.x" :cy="n.y"
        r="60"
        fill="url(#masteredGlow)"
      />

      <GraphEdge
        v-for="(edge, i) in store.edges"
        :key="`edge-${i}`"
        :from="nodeMap[edge.source]"
        :to="nodeMap[edge.target]"
      />

      <GraphNode
        v-for="n in store.nodes"
        :key="n.id"
        :node="n"
        :is-selected="store.activeNode?.id === n.id"
        @click="handleClick"
      />
    </svg>

    <div v-if="store.totalCount === 0" class="empty-graph">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" stroke-width="1">
        <circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/>
        <path d="M12 7v4M12 11L5 17M12 11L19 17"/>
      </svg>
      <div class="empty-title">暂无知识图谱</div>
      <div class="empty-sub">在左侧对话框告诉 AI 你想学什么</div>
    </div>

    <canvas ref="confettiCanvasRef" class="confetti-canvas" />

    <Transition name="fade">
      <div v-if="showScaleHint" class="scale-hint">
        {{ Math.round(scale * 100) }}%
      </div>
    </Transition>

    <div class="controls">
      <button class="ctrl-btn" title="居中" @click="resetView">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"/><path d="M3 12h3M18 12h3M12 3v3M12 18v3"/>
        </svg>
      </button>
      <button class="ctrl-btn" title="放大" @click="zoomIn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 5v14M5 12h14"/>
        </svg>
      </button>
      <button class="ctrl-btn" title="缩小" @click="zoomOut">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M5 12h14"/>
        </svg>
      </button>
    </div>

  </div>
</template>

<script setup lang="ts">
// KnowledgeGraph 组件，封装局部界面和交互逻辑。
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useLearningStore } from '../stores/learning'
import type { KNode } from '../types'
import { useGraphViewport } from '../composables/useGraphViewport'
import GraphNode from './graph/GraphNode.vue'
import GraphEdge from './graph/GraphEdge.vue'
import GraphLegend from './graph/GraphLegend.vue'

const store = useLearningStore()
const containerRef = ref<HTMLElement | null>(null)
const svgRef = ref<SVGSVGElement | null>(null)
const confettiCanvasRef = ref<HTMLCanvasElement | null>(null)

let VW = 900
let VH = 720

const { scale, panX, panY, showScaleHint, zoomIn, zoomOut, resetView } = useGraphViewport(
  svgRef,
  { width: () => VW, height: () => VH },
)

watch(() => store.nodes, (nodes) => {
  if (nodes.length === 0) {
    VW = 900
    VH = 720
    panX.value = 0
    panY.value = 0
    return
  }
  const maxX = Math.max(...nodes.map(n => n.x)) + 120
  const maxY = Math.max(...nodes.map(n => n.y)) + 120
  VW = Math.max(1200, maxX)
  VH = Math.max(720, maxY)
  nextTick(() => resetView())
})

const viewBoxParts = computed(() =>
  viewBox.value.split(' ').map(Number)
)

const viewBox = computed(() => {
  const w = VW / scale.value
  const h = VH / scale.value

  let offsetX = 0
  let offsetY = 0
  if (store.nodes.length > 0) {

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const n of store.nodes) {
      if (n.x < minX) minX = n.x
      if (n.x > maxX) maxX = n.x
      if (n.y < minY) minY = n.y
      if (n.y > maxY) maxY = n.y
    }
    offsetX = (minX + maxX) / 2 - VW / 2
    offsetY = (minY + maxY) / 2 - VH / 2
  }

  const x = offsetX + panX.value + (VW - w) / 2
  const y = offsetY + panY.value + (VH - h) / 2
  return `${x} ${y} ${w} ${h}`
})

const currentTopicTitle = computed(() => {
  const t = store.topics.find(t => t.id === store.activeTopicId)
  return t?.title ?? 'Knowledge Graph'
})

let confettiInstance: any = null

const nodeMap = computed(() =>
  Object.fromEntries(store.nodes.map(n => [n.id, n]))
)
const masteredNodes = computed(() =>
  store.nodes.filter(n => n.state === 'mastered')
)

function getNodeScreenPos(node: KNode) {
  if (!containerRef.value || !svgRef.value) return { x: 0.5, y: 0.5 }
  const containerRect = containerRef.value.getBoundingClientRect()
  const svgRect = svgRef.value.getBoundingClientRect()
  const parts = viewBox.value.split(' ').map(Number)
  const [vx, vy, vw, vh] = parts
  const px = ((node.x - vx) / vw) * svgRect.width + (svgRect.left - containerRect.left)
  const py = ((node.y - vy) / vh) * svgRect.height + (svgRect.top - containerRect.top)
  return {
    x: px / containerRect.width,
    y: py / containerRect.height,
  }
}

function fireConfettiAt(node: KNode) {
  if (!confettiInstance) return
  const pos = getNodeScreenPos(node)
  confettiInstance({
    particleCount: 38,
    spread: 65,
    startVelocity: 24,
    origin: pos,
    colors: ['#9CC8E8', '#C7DFF1', '#E8DFC9', '#F4ECD8', '#7AB0D6'],
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
    colors: ['#9CC8E8', '#C7DFF1', '#E8DFC9', '#F4ECD8', '#7AB0D6', '#FAC775', '#F09595'],
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
      colors: ['#9CC8E8', '#FAC775', '#9FE1CB'],
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
      colors: ['#C7DFF1', '#F09595', '#AFA9EC'],
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
  () => store.nodes.filter(n => n.state === 'mastered').map(n => n.id),
  (newIds, oldIds) => {
    const oldSet = new Set(oldIds)
    for (const id of newIds) {
      if (oldSet.has(id)) continue
      const node = store.nodes.find(n => n.id === id)
      if (node) setTimeout(() => fireConfettiAt(node), 50)
    }
  }
)

watch(() => store.activeTopicId, () => resetView())

watch(() => store.lastMasteredId, (id) => {
  if (!id) return
  const node = store.nodes.find(n => n.id === id)
  if (node) {
    fireConfettiAt(node)
    const allMastered = store.nodes.length > 0 &&
      store.nodes.every(n => n.state === 'mastered')
    if (allMastered) {
      setTimeout(() => fireCelebration(), 400)
    }
  }
})

function handleClick(node: KNode) {
  store.setActiveNode(node)
}
</script>

<style scoped>
.graph-wrap {
  position: relative;
  flex: 1;
  background: linear-gradient(180deg, var(--bg-2), var(--bg));
  border: 1px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow: 0 1px 0 var(--line), 0 6px 20px -8px oklch(0.5 0.04 235 / 0.12);
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
  background: linear-gradient(180deg, var(--bg-2) 60%, transparent);
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

.graph-svg {
  width: 100%;
  height: 100%;
  display: block;
  cursor: grab;
}
.graph-svg:active {
  cursor: grabbing;
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

.scale-hint {
  position: absolute;
  bottom: 56px;
  right: 14px;
  background: oklch(0.22 0.012 250);
  color: white;
  font-size: 12px;
  font-weight: 600;
  font-family: var(--font-mono);
  padding: 5px 10px;
  border-radius: 8px;
  pointer-events: none;
  z-index: 10;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity .2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
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
</style>
