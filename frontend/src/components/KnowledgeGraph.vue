<template>
  <div ref="containerRef" class="graph-wrap">

    <!-- Header -->
    <div class="graph-header">
      <div>
        <div class="graph-label">Knowledge Graph</div>
        <div class="graph-title">
          Python 基础知识
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
      viewBox="0 0 600 720"
      preserveAspectRatio="xMidYMid meet"
      class="graph-svg"
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

      <g :transform="`translate(${translateX}, ${translateY}) scale(${scale})`">
        <rect width="600" height="720" fill="url(#grid)" />

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
          @hover="handleHover"
        />
      </g>
    </svg>

    <!-- Tooltip -->
    <div
      v-if="tip"
      class="tip"
      :style="{ left: tip.x + 'px', top: tip.y + 'px' }"
    >
      {{ tip.text }}
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
import { ref, computed, onMounted, watch, h } from 'vue'
import { useLearningStore } from '../stores/learning'
import type { KNode } from '../types'
import GraphNode from './GraphNode.vue'
import GraphEdge from './GraphEdge.vue'

// LegendItem 组件
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
const scale = ref(1)
const translateX = ref(0)
const translateY = ref(0)
const showScaleHint = ref(false)

const CX = 300
const CY = 360

// 拖拽状态
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const dragStartTranslate = ref({ x: 0, y: 0 })

const containerRef = ref<HTMLElement | null>(null)
const confettiCanvasRef = ref<HTMLCanvasElement | null>(null)
const tip = ref<{ x: number; y: number; text: string } | null>(null)

let confettiInstance: any = null
let hintTimer: ReturnType<typeof setTimeout> | null = null

const nodeMap = computed(() =>
  Object.fromEntries(store.nodes.map(n => [n.id, n]))
)

const masteredNodes = computed(() =>
  store.nodes.filter(n => n.state === 'mastered')
)

function getNodePixelPos(node: KNode) {
  if (!containerRef.value) return { x: 0.5, y: 0.5 }
  const svg = containerRef.value.querySelector('svg')
  if (!svg) return { x: 0.5, y: 0.5 }
  const containerRect = containerRef.value.getBoundingClientRect()
  const svgRect = svg.getBoundingClientRect()
  const sx = svgRect.width / 600
  const sy = svgRect.height / 720
  return {
    x: (node.x * sx + (svgRect.left - containerRect.left)) / containerRect.width,
    y: (node.y * sy + (svgRect.top - containerRect.top)) / containerRect.height,
  }
}

function fireConfettiAt(node: KNode) {
  if (!confettiInstance) return
  const pos = getNodePixelPos(node)
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

function showHint() {
  showScaleHint.value = true
  if (hintTimer) clearTimeout(hintTimer)
  hintTimer = setTimeout(() => {
    showScaleHint.value = false
  }, 1200)
}

function zoomIn() {
  const newScale = Math.min(scale.value + 0.15, 2.5)
  translateX.value = CX - (CX - translateX.value) * (newScale / scale.value)
  translateY.value = CY - (CY - translateY.value) * (newScale / scale.value)
  scale.value = newScale
  showHint()
}

function zoomOut() {
  const newScale = Math.max(scale.value - 0.15, 0.4)
  translateX.value = CX - (CX - translateX.value) * (newScale / scale.value)
  translateY.value = CY - (CY - translateY.value) * (newScale / scale.value)
  scale.value = newScale
  showHint()
}

function resetView() {
  scale.value = 1
  translateX.value = 0
  translateY.value = 0
  showHint()
}

function clampTranslate(tx: number, ty: number) {
  if (!containerRef.value) return { x: tx, y: ty }
  const svg = containerRef.value.querySelector('svg')
  if (!svg) return { x: tx, y: ty }
  const svgRect = svg.getBoundingClientRect()
  const contentW = 600 * scale.value
  const contentH = 720 * scale.value
  const sx = svgRect.width / 600
  const sy = svgRect.height / 720
  const maxX = 100 * sx * scale.value
  const minX = -(contentW - 600) * sx + maxX * -1
  const maxY = 100 * sy * scale.value
  const minY = -(contentH - 720) * sy + maxY * -1
  return {
    x: Math.min(Math.max(tx, minX), maxX),
    y: Math.min(Math.max(ty, minY), maxY),
  }
}

onMounted(() => {
  if (confettiCanvasRef.value && (window as any).confetti) {
    confettiInstance = (window as any).confetti.create(confettiCanvasRef.value, {
      resize: true,
      useWorker: false,
    })
  }

  setTimeout(() => {
    masteredNodes.value.forEach((n, i) => {
      setTimeout(() => fireConfettiAt(n), i * 220)
    })
  }, 600)

  const svgEl = containerRef.value?.querySelector('svg')
  if (!svgEl) return

  // 滚轮缩放
  svgEl.addEventListener('wheel', (e: WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    const newScale = Math.min(Math.max(scale.value + delta, 0.4), 2.5)
    translateX.value = CX - (CX - translateX.value) * (newScale / scale.value)
    translateY.value = CY - (CY - translateY.value) * (newScale / scale.value)
    scale.value = newScale
    showHint()
  }, { passive: false })

  // 拖拽开始
  svgEl.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button !== 0) return
    const target = e.target as SVGElement
    if (target.closest('g.knode') || target.tagName === 'text') return
    isDragging.value = true
    dragStart.value = { x: e.clientX, y: e.clientY }
    dragStartTranslate.value = { x: translateX.value, y: translateY.value }
    svgEl.style.cursor = 'grabbing'
    e.preventDefault()
  })

  // 拖拽移动
  window.addEventListener('mousemove', (e: MouseEvent) => {
    if (!isDragging.value) return
    const dx = e.clientX - dragStart.value.x
    const dy = e.clientY - dragStart.value.y
    const svg = containerRef.value?.querySelector('svg')
    if (!svg) return
    const svgRect = svg.getBoundingClientRect()
    const sx = 600 / svgRect.width
    const sy = 720 / svgRect.height
    const rawX = dragStartTranslate.value.x + dx * sx
    const rawY = dragStartTranslate.value.y + dy * sy
    const clamped = clampTranslate(rawX, rawY)
    translateX.value = clamped.x
    translateY.value = clamped.y
  })

  // 拖拽结束
  window.addEventListener('mouseup', () => {
    if (!isDragging.value) return
    isDragging.value = false
    if (svgEl) svgEl.style.cursor = 'grab'
  })

  svgEl.style.cursor = 'grab'
})

watch(
  () => store.nodes.filter(n => n.state === 'mastered').map(n => n.id),
  (newIds, oldIds) => {
    const added = newIds.filter(id => !oldIds.includes(id))
    added.forEach(id => {
      const node = store.nodes.find(n => n.id === id)
      if (node) setTimeout(() => fireConfettiAt(node), 50)
    })
  }
)

function handleClick(node: KNode) {
  if (node.state === 'locked') return
  store.setActiveNode(node)
}

function handleHover(payload: { node: KNode | null; event?: MouseEvent }) {
  if (!payload.node) {
    tip.value = null
    return
  }
  if (!containerRef.value) return
  const svg = containerRef.value.querySelector('svg')
  if (!svg) return
  const containerRect = containerRef.value.getBoundingClientRect()
  const svgRect = svg.getBoundingClientRect()
  const sx = svgRect.width / 600
  const sy = svgRect.height / 720
  const x = payload.node.x * sx + (svgRect.left - containerRect.left)
  const y = payload.node.y * sy + (svgRect.top - containerRect.top)
  const textMap: Record<string, string> = {
    mastered: '已掌握 · 点击复习',
    available: '可学习 · 点击开始',
    locked: '已锁定 · 解锁前置节点',
  }
  tip.value = { x, y, text: textMap[payload.node.state] }
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
}

.tip {
  position: absolute;
  pointer-events: none;
  background: oklch(0.22 0.012 250);
  color: var(--bg);
  font-size: 11.5px;
  padding: 6px 9px;
  border-radius: 6px;
  transform: translate(-50%, calc(-100% - 10px));
  white-space: nowrap;
  z-index: 50;
  font-weight: 500;
}

.tip::after {
  content: '';
  position: absolute;
  left: 50%; bottom: -4px;
  transform: translateX(-50%) rotate(45deg);
  width: 8px; height: 8px;
  background: oklch(0.22 0.012 250);
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