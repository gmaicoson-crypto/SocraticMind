<template>
  <div ref="hostRef" class="three-graph-canvas">
    <canvas ref="canvasRef" class="three-graph-canvas__webgl" aria-hidden="true" />
    <div class="three-graph-canvas__labels" aria-hidden="true">
      <div
        v-for="node in nodes"
        :key="node.id"
        :ref="(element) => setLabelRef(node.id, element)"
        class="graph-node-label"
        :class="node.state"
        :data-node-id="node.id"
      >
        <strong>{{ node.label }}</strong>
        <small>{{ node.sub }}</small>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch, type ComponentPublicInstance } from 'vue'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import type { KEdge, KNode } from '../../types'
import { graphCameraFrame } from './graphFit'
import { createGraphSceneState } from './createGraphSceneState'
import { createGraphLayout } from './createGraphLayout'
import { createGraphObjects } from './createGraphObjects'
import { createGraphInteractions } from './createGraphInteractions'
import { palette } from './graphAppearance'
import { MOBILE_NODE_SCALE, NODE_WIDTH } from './graphSceneTypes'
import * as THREE from 'three'
const props = defineProps<{
  nodes: KNode[]
  edges: KEdge[]
  selectedId?: string | null
  themeKey?: string
}>()
const emit = defineEmits<{
  select: [node: KNode]
  activate: [node: KNode]
}>()
const hostRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const state = createGraphSceneState(props, hostRef, canvasRef)
const {
  labelRefs,
  activeId,
  nodeObjects,
  edgeObjects,
  scene,
  camera,
  renderer,
  viewScale,
  viewOffset,
  hoveredId,
  layoutMode,
} = state
const layout = createGraphLayout(state)
const { nodeWorldPosition, setWorldBounds, updateLayoutScale, graphContentBounds } = layout
const objects = createGraphObjects({ ...state, ...layout })
const { clearScene, makeNode, makeEdge, updateEdge } = objects
const interaction = createGraphInteractions({ ...state, ...objects, updateFocus, emit })
const {
  clamp,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onDoubleClick,
  onPointerCancel,
  onPointerLeave,
  onWheel,
} = interaction
let viewCenterY = 0

let resizeObserver: ResizeObserver | null = null

let animationFrame: number | null = null

let clock: THREE.Clock | null = null

let prefersReducedMotion: MediaQueryList | null = null

function setLabelRef(id: string, element: Element | ComponentPublicInstance | null) {
  if (element instanceof HTMLElement) labelRefs.set(id, element)
  else labelRefs.delete(id)
}

function resetLayout(preserveOffsets = false) {
  const mobile = layoutMode.value === 'mobile'
  nodeObjects.forEach((group, id) => {
    const node = props.nodes.find((item) => item.id === id)
    if (!node) return
    const position = nodeWorldPosition(node)
    const offsetX = preserveOffsets ? group.userData.baseX - group.userData.homeX : 0
    const offsetY = preserveOffsets ? group.userData.baseY - group.userData.homeY : 0
    group.userData.homeX = position.x
    group.userData.homeY = position.y
    group.userData.baseX = position.x + offsetX
    group.userData.baseY = position.y + offsetY
    group.position.set(group.userData.baseX, group.userData.baseY, 0)
    group.scale.setScalar(mobile ? MOBILE_NODE_SCALE : 1)
  })
  edgeObjects.forEach((edge) => {
    const from = nodeObjects.get(edge.source)?.position
    const to = nodeObjects.get(edge.target)?.position
    if (!from || !to) return
    edge.maxLength = Math.hypot(to.x - from.x, to.y - from.y) + (mobile ? 85 : 100)
    updateEdge(edge)
  })
}

function syncScene() {
  if (!renderer.value) return
  clearScene()
  setWorldBounds()
  const colors = palette()
  props.nodes.forEach((node) => makeNode(node, colors))
  props.edges.forEach((edge) => makeEdge(edge.source, edge.target, colors))
  resetLayout()
  applyTheme()
  updateFocus()
}

function resize() {
  if (!hostRef.value || !renderer.value) return
  const rect = hostRef.value.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return
  const aspect = rect.width / Math.max(rect.height, 1)
  const nextLayout = rect.width <= 620 ? 'mobile' : 'desktop'
  const modeChanged = layoutMode.value !== nextLayout
  if (modeChanged) {
    layoutMode.value = nextLayout
    setWorldBounds()
  }
  const header = hostRef.value.parentElement?.querySelector('.graph-header')
  const viewport = {
    width: rect.width,
    height: rect.height,
    top: (header?.getBoundingClientRect().height ?? 72) + 24,
    bottom: 68,
    side: nextLayout === 'mobile' ? 16 : 28,
  }
  const nodeScale = nextLayout === 'mobile' ? MOBILE_NODE_SCALE : 1
  const maxNodeWidth = nextLayout === 'mobile' ? 120 : 220
  const minimumVisibleWidth = (NODE_WIDTH * nodeScale * rect.width) / maxNodeWidth
  if (updateLayoutScale(viewport, minimumVisibleWidth) || modeChanged) resetLayout(true)
  const bounds = graphContentBounds()
  const { visibleWidth, centerY } = graphCameraFrame(bounds, viewport, minimumVisibleWidth)
  viewCenterY = centerY
  const visibleHeight = visibleWidth / Math.max(aspect, 0.01)
  const base = visibleHeight / 2
  camera.top = base
  camera.bottom = -base
  camera.left = -base * aspect
  camera.right = base * aspect
  camera.updateProjectionMatrix()
  renderer.value.setSize(rect.width, rect.height, false)
  nodeObjects.forEach((group) =>
    group.userData.selectionRing.material.resolution.set(rect.width, rect.height),
  )
  edgeObjects.forEach((edge) => edge.line.material.resolution.set(rect.width, rect.height))
}

function updateLabels() {
  if (!hostRef.value || !renderer.value) return
  const rect = hostRef.value.getBoundingClientRect()
  const pixelsPerWorldUnit = (rect.height * camera.zoom) / (camera.top - camera.bottom)
  nodeObjects.forEach((group, id) => {
    const projected = new THREE.Vector3(group.position.x, group.position.y, 0).project(camera)
    const label = labelRefs.get(id)
    if (!label) return
    label.style.left = `${(projected.x * 0.5 + 0.5) * rect.width}px`
    label.style.top = `${(-projected.y * 0.5 + 0.5) * rect.height}px`
    label.style.setProperty('--label-scale', String(group.scale.x * pixelsPerWorldUnit))
    label.classList.toggle('active', activeId.value === id || hoveredId.value === id)
    label.classList.toggle('dimmed', Boolean(hoveredId.value && hoveredId.value !== id))
  })
}

function updateFocus() {
  nodeObjects.forEach((group, id) => {
    const focused = !hoveredId.value || hoveredId.value === id
    const state = group.userData.state as KNode['state']
    group.userData.body.material.opacity =
      state === 'locked' ? (focused ? 0.55 : 0.16) : focused ? 0.96 : 0.28
    group.userData.outline.material.opacity = focused ? (state === 'locked' ? 0.5 : 0.95) : 0.16
    group.userData.outline.scale.setScalar(id === activeId.value ? 1.045 : 1.005)
  })
}

function applyTheme() {
  const colors = palette()
  nodeObjects.forEach((group, id) => {
    const node = props.nodes.find((item) => item.id === id)
    if (!node) return
    const stroke =
      node.state === 'mastered'
        ? colors.blue2
        : node.state === 'available'
          ? colors.blue
          : colors.locked
    group.userData.mask.material.color.copy(colors.background)
    group.userData.body.material.color.copy(
      node.state === 'mastered'
        ? colors.mastered
        : node.state === 'available'
          ? colors.surface
          : colors.locked,
    )
    group.userData.outline.material.color.copy(stroke)
    group.userData.selectionRing.material.color.copy(colors.blue)
  })
  edgeObjects.forEach((edge) => {
    const material = edge.line.material as LineMaterial
    material.color.copy(colors.line)
  })
}

function resetView() {
  viewScale.value = 1
  viewOffset.x = 0
  viewOffset.y = 0
}

function restoreLayout() {
  resetLayout()
  resetView()
}

function zoomIn() {
  viewScale.value = clamp(viewScale.value + 0.15, 0.72, 1.55)
}

function zoomOut() {
  viewScale.value = clamp(viewScale.value - 0.15, 0.72, 1.55)
}

function getNodeScreenPos(node: KNode) {
  if (!hostRef.value) return { x: 0.5, y: 0.5 }
  const group = nodeObjects.get(node.id)
  if (!group) return { x: 0.5, y: 0.5 }
  const projected = new THREE.Vector3(group.position.x, group.position.y, 0).project(camera)
  return {
    x: projected.x * 0.5 + 0.5,
    y: -projected.y * 0.5 + 0.5,
  }
}

function animate() {
  if (!renderer.value || !clock) return
  const time = clock.getElapsedTime()
  const activeMotion = !document.hidden && !(prefersReducedMotion?.matches ?? false)
  camera.zoom = viewScale.value
  camera.position.x += (viewOffset.x - camera.position.x) * 0.1
  camera.position.y += (viewCenterY + viewOffset.y - camera.position.y) * 0.1
  camera.updateProjectionMatrix()
  nodeObjects.forEach((group, id) => {
    const baseScale = layoutMode.value === 'mobile' ? MOBILE_NODE_SCALE : 1
    const breath = activeMotion ? Math.sin(time * 1.4 + group.userData.phase) * 0.012 : 0
    const emphasis = id === activeId.value || id === hoveredId.value ? 0.055 : 0
    const targetScale = baseScale * (1 + emphasis + breath)
    group.scale.setScalar(group.scale.x + (targetScale - group.scale.x) * 0.12)
    const ring = group.userData.selectionRing as Line2
    ring.visible = activeId.value === id
    if (ring.visible) {
      ring.material.dashOffset = activeMotion ? -time * 14 : 0
      ring.material.opacity = 0.88
    }
  })
  updateLabels()
  renderer.value.render(scene, camera)
  animationFrame = requestAnimationFrame(animate)
}

function initialize() {
  if (!canvasRef.value || !hostRef.value) return
  renderer.value = new THREE.WebGLRenderer({
    canvas: canvasRef.value,
    antialias: true,
    alpha: true,
  })
  renderer.value.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.value.setClearColor(0x000000, 0)
  camera.position.z = 5
  clock = new THREE.Clock()
  prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  canvasRef.value.addEventListener('pointerdown', onPointerDown)
  canvasRef.value.addEventListener('pointermove', onPointerMove)
  canvasRef.value.addEventListener('pointerup', onPointerUp)
  canvasRef.value.addEventListener('dblclick', onDoubleClick)
  canvasRef.value.addEventListener('pointercancel', onPointerCancel)
  canvasRef.value.addEventListener('pointerleave', onPointerLeave)
  canvasRef.value.addEventListener('wheel', onWheel, { passive: false })
  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(hostRef.value)
  const header = hostRef.value.parentElement?.querySelector('.graph-header')
  if (header) resizeObserver.observe(header)
  syncScene()
  resize()
  animate()
}

watch(
  () => props.nodes,
  () => {
    nextTick(() => {
      syncScene()
      resetView()
      resize()
    })
  },
  { deep: true },
)

watch(
  () => props.edges,
  () =>
    nextTick(() => {
      syncScene()
      resize()
    }),
  { deep: true },
)

watch(
  () => props.selectedId,
  (id) => {
    activeId.value = id ?? null
  },
)

watch(
  () => props.themeKey,
  () => nextTick(applyTheme),
)

onMounted(() => nextTick(initialize))

onBeforeUnmount(() => {
  if (animationFrame !== null) cancelAnimationFrame(animationFrame)
  resizeObserver?.disconnect()
  canvasRef.value?.removeEventListener('pointerdown', onPointerDown)
  canvasRef.value?.removeEventListener('pointermove', onPointerMove)
  canvasRef.value?.removeEventListener('pointerup', onPointerUp)
  canvasRef.value?.removeEventListener('dblclick', onDoubleClick)
  canvasRef.value?.removeEventListener('pointercancel', onPointerCancel)
  canvasRef.value?.removeEventListener('pointerleave', onPointerLeave)
  canvasRef.value?.removeEventListener('wheel', onWheel)
  clearScene()
  renderer.value?.dispose()
  renderer.value = null
})

defineExpose({ resetView, restoreLayout, zoomIn, zoomOut, getNodeScreenPos })
</script>

<style scoped>
.three-graph-canvas {
  position: absolute;
  inset: 0;
  overflow: hidden;
  touch-action: none;
}

.three-graph-canvas__webgl,
.three-graph-canvas__labels {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.three-graph-canvas__webgl {
  display: block;
  cursor: grab;
  touch-action: none;
}

.three-graph-canvas__webgl:active {
  cursor: grabbing;
}

.three-graph-canvas__labels {
  pointer-events: none;
  overflow: hidden;
}

.graph-node-label {
  --label-scale: 1;
  position: absolute;
  width: 174px;
  height: 64px;
  padding: 0 2px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  transform: translate(-50%, -50%) scale(var(--label-scale));
  color: var(--graph-node-available-label);
  text-align: center;
  user-select: none;
  transition: opacity 0.2s ease;
}

.graph-node-label strong,
.graph-node-label small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.graph-node-label strong {
  font-size: 16px;
  font-weight: 650;
}

.graph-node-label small {
  margin-top: 5px;
  color: var(--graph-node-available-sub);
  font: 12px/1 var(--font-mono);
}

.graph-node-label.mastered {
  color: var(--graph-node-mastered-label);
}

.graph-node-label.mastered small {
  color: var(--graph-node-mastered-sub);
}

.graph-node-label.locked {
  color: var(--ink-2);
  opacity: 0.8;
}

.graph-node-label.locked small {
  color: var(--ink-3);
}

.graph-node-label.dimmed {
  opacity: 0.62;
}

.graph-node-label.locked.dimmed {
  opacity: 0.72;
}

.graph-node-label.mastered.dimmed {
  color: var(--graph-node-mastered-label);
}

.graph-node-label.mastered.dimmed small {
  color: var(--graph-node-mastered-sub);
}

.graph-node-label.active strong {
  color: var(--blue-2);
}

.graph-node-label.mastered.active strong {
  color: var(--graph-node-mastered-label);
}
</style>
