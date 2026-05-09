<template>
  <div ref="containerRef" class="graph-wrap">

    <!-- Header -->
    <div class="graph-header">
      <div>
        <div class="graph-label">Knowledge Graph</div>
        <div class="graph-title">
          {{ currentTopicTitle }}
          <span class="graph-count">· {{ store.totalCount }} 节点</span>
        </div>
      </div>
      <div class="legend-wrap">
        <LegendItem label="已掌握" :count="store.masteredCount" variant="mastered" />
        <LegendItem label="可用" :count="store.availableCount" variant="available" />
        <LegendItem label="锁定" :count="store.totalCount - store.masteredCount - store.availableCount" variant="locked" />
      </div>
    </div>

    <!-- SVG Graph -->
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

    <!-- 无主题提示 -->
    <div v-if="store.totalCount === 0" class="empty-graph">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" stroke-width="1">
        <circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/>
        <path d="M12 7v4M12 11L5 17M12 11L19 17"/>
      </svg>
      <div class="empty-title">暂无知识图谱</div>
      <div class="empty-sub">在左侧对话框告诉 AI 你想学什么</div>
    </div>

    <!-- Confetti canvas -->
    <canvas ref="confettiCanvasRef" class="confetti-canvas" />

    <!-- 缩放比例提示 -->
    <Transition name="fade">
      <div v-if="showScaleHint" class="scale-hint">
        {{ Math.round(scale * 100) }}%
      </div>
    </Transition>

    <!-- Controls -->
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
import { ref, computed, onMounted, onBeforeUnmount, watch, h, nextTick } from 'vue'
import { useLearningStore } from '../stores/learning'
import type { KNode } from '../types'
import GraphNode from './GraphNode.vue'
import GraphEdge from './GraphEdge.vue'

const LegendItem = (props: { label: string; count: number; variant: string }) => {
  const dotStyle: Record<string, { bg: string; border: string }> = {
    mastered: { bg: 'var(--blue)', border: 'var(--blue-2)' },
    available: { bg: 'var(--surface)', border: 'var(--blue)' },
    locked: { bg: 'var(--bg-3)', border: 'var(--locked)' },
  }
  const d = dotStyle[props.variant] || dotStyle.locked
  return h('div', {
    style: {
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      padding: '4px 10px',
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      borderRadius: '999px',
      fontSize: '11.5px', fontWeight: '500', color: 'var(--ink-2)',
    }
  }, [
    h('span', { style: { width: '9px', height: '9px', borderRadius: '50%', background: d.bg, border: `1.5px solid ${d.border}`, display: 'inline-block' } }),
    props.label,
    h('span', { style: { color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: '10.5px' } }, String(props.count)),
  ])
}

const store = useLearningStore()
const containerRef = ref<HTMLElement | null>(null)
const svgRef = ref<SVGSVGElement | null>(null)
const confettiCanvasRef = ref<HTMLCanvasElement | null>(null)
const showScaleHint = ref(false)

// 基础 viewBox 尺寸
let VW = 900
let VH = 720

// 节点加载后检查范围，兜底扩展画布
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

// 缩放和平移
const scale = ref(1)
const panX = ref(0)
const panY = ref(0)

const MIN_SCALE = 0.85
const MAX_SCALE = 2.5

// 动态 viewBox：通过改变 viewBox 大小实现缩放，内容始终铺满容器
const viewBoxParts = computed(() =>
  viewBox.value.split(' ').map(Number)
)

const viewBox = computed(() => {
  // viewBox 中心对齐节点包围盒中心，缩放从原点不会让图飘出可视区
  const w = VW / scale.value
  const h = VH / scale.value

  let offsetX = 0
  let offsetY = 0
  if (store.nodes.length > 0) {
    // 一遍 reduce 求 min/max，避免 Math.min(...arr) 在节点数千时栈溢出
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
let hintTimer: ReturnType<typeof setTimeout> | null = null

const nodeMap = computed(() =>
  Object.fromEntries(store.nodes.map(n => [n.id, n]))
)
const masteredNodes = computed(() =>
  store.nodes.filter(n => n.state === 'mastered')
)

function showHint() {
  showScaleHint.value = true
  if (hintTimer) clearTimeout(hintTimer)
  hintTimer = setTimeout(() => { showScaleHint.value = false }, 1200)
}

function zoomIn() {
  scale.value = Math.min(scale.value + 0.15, MAX_SCALE)
  showHint()
}

function zoomOut() {
  scale.value = Math.max(scale.value - 0.15, MIN_SCALE)
  showHint()
}

function resetView() {
  scale.value = 1
  panX.value = 0
  panY.value = 0
  showHint()
}

// 拖拽
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const panStart = ref({ x: 0, y: 0 })

function clampPan(x: number, y: number) {
  // 限制平移幅度，避免拖到屏幕外丢失图形可见性
  const limit = 300
  return {
    x: Math.min(Math.max(x, -limit), limit),
    y: Math.min(Math.max(y, -limit), limit),
  }
}

function getNodeScreenPos(node: KNode) {
  // 把 SVG 用户坐标换算到容器归一化坐标，给 confetti 当 origin 用
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
  // 三波彩纸屑从不同位置
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

  const svgEl = svgRef.value
  if (!svgEl) return

  svgEl.addEventListener('wheel', onWheel, { passive: false })
  svgEl.addEventListener('mousedown', onMouseDown)
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)

  svgEl.style.cursor = 'grab'
})

// 滚轮缩放
function onWheel(e: WheelEvent) {
  e.preventDefault()
  const delta = e.deltaY > 0 ? -0.1 : 0.1
  scale.value = Math.min(Math.max(scale.value + delta, MIN_SCALE), MAX_SCALE)
  showHint()
}

function onMouseDown(e: MouseEvent) {
  if (e.button !== 0 || !svgRef.value) return
  const target = e.target as SVGElement
  if (target.closest('g.knode') || target.tagName === 'text') return
  isDragging.value = true
  dragStart.value = { x: e.clientX, y: e.clientY }
  panStart.value = { x: panX.value, y: panY.value }
  svgRef.value.style.cursor = 'grabbing'
  e.preventDefault()
}

// rAF 节流：原生 mousemove 触发率高，无节流时每帧多次更新 panX/panY 会反复触发 viewBox 重算
let panFrame: number | null = null
let lastMouseEvent: MouseEvent | null = null
function onMouseMove(e: MouseEvent) {
  if (!isDragging.value) return
  lastMouseEvent = e
  if (panFrame !== null) return
  panFrame = requestAnimationFrame(() => {
    panFrame = null
    const ev = lastMouseEvent
    if (!ev || !svgRef.value) return
    const svgRect = svgRef.value.getBoundingClientRect()
    // 鼠标右移，panX 应减小（内容跟着右移）
    const dx = (ev.clientX - dragStart.value.x) / svgRect.width * (VW / scale.value)
    const dy = (ev.clientY - dragStart.value.y) / svgRect.height * (VH / scale.value)
    const clamped = clampPan(panStart.value.x - dx, panStart.value.y - dy)
    panX.value = clamped.x
    panY.value = clamped.y
  })
}

function onMouseUp() {
  if (!isDragging.value) return
  isDragging.value = false
  if (svgRef.value) svgRef.value.style.cursor = 'grab'
}

let initialConfettiTimer: ReturnType<typeof setTimeout> | null = null
const pendingConfettiTimers: ReturnType<typeof setTimeout>[] = []

onBeforeUnmount(() => {
  // 清除路由切换后还在飞的 confetti 定时与 rAF；防止引用已销毁 DOM
  if (hintTimer) clearTimeout(hintTimer)
  if (initialConfettiTimer) clearTimeout(initialConfettiTimer)
  pendingConfettiTimers.forEach(clearTimeout)
  if (panFrame !== null) cancelAnimationFrame(panFrame)

  const svgEl = svgRef.value
  if (svgEl) {
    svgEl.removeEventListener('wheel', onWheel)
    svgEl.removeEventListener('mousedown', onMouseDown)
  }
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
})

// Set 差集 O(n)；之前用 .filter(includes) 是 O(n²)，节点多了会卡帧
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
    // 检查是否全部掌握
    const allMastered = store.nodes.length > 0 &&
      store.nodes.every(n => n.state === 'mastered')
    if (allMastered) {
      // 延迟触发全屏庆祝
      setTimeout(() => fireCelebration(), 400)
    }
  }
})

function handleClick(node: KNode) {
  if (node.state === 'locked') return
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
  top: 0; left: 0; right: 0;
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
.graph-svg:active { cursor: grabbing; }

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
  bottom: 56px; right: 14px;
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
.fade-leave-active { transition: opacity .2s ease; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }

.controls {
  position: absolute;
  bottom: 14px; right: 14px;
  display: flex;
  gap: 4px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 4px;
}

.ctrl-btn {
  width: 28px; height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--ink-2);
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.ctrl-btn:hover { background: var(--bg-3); }
</style>