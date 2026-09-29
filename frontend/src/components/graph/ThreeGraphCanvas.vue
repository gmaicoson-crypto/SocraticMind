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
import * as THREE from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import type { KEdge, KNode } from '../../types'
import {
  graphCameraFrame,
  graphDesktopPositions,
  graphLayoutScale,
  type GraphViewport,
} from './graphFit'

const NODE_WIDTH = 190
const NODE_HEIGHT = 82
const NODE_RADIUS = 14
const EDGE_SAMPLES = 32
const GRAPH_VIEW_PADDING = 32
const MOBILE_NODE_SCALE = 0.6

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
const labelRefs = new Map<string, HTMLElement>()
const activeId = ref<string | null>(props.selectedId ?? null)

const world = { width: 1100, height: 720, centerX: 0, centerY: 0 }
const mobilePositions = new Map<string, { x: number; y: number }>()
const desktopPositions = new Map<string, { x: number; y: number }>()
const nodeObjects = new Map<string, THREE.Group>()
const edgeObjects: EdgeObject[] = []
const scene = new THREE.Scene()
const camera = new THREE.OrthographicCamera(-550, 550, 360, -360, -10, 10)
const pointer = new THREE.Vector2()
const raycaster = new THREE.Raycaster()
const renderer = ref<THREE.WebGLRenderer | null>(null)
const viewScale = ref(1)
const viewOffset = { x: 0, y: 0 }
let viewCenterY = 0
const layoutScale = { x: 1, y: 1 }
const hoveredId = ref<string | null>(null)
const layoutMode = ref<'desktop' | 'mobile'>('desktop')

let resizeObserver: ResizeObserver | null = null
let animationFrame: number | null = null
let dragMode: 'node' | 'pan' | null = null
let draggedNodeId: string | null = null
let nodeWasDragged = false
const clickSequence: string[] = []
let dragStart = { x: 0, y: 0 }
let dragStartWorld: THREE.Vector3 | null = null
let nodeStart: { x: number; y: number } | null = null
let offsetStart = { x: 0, y: 0 }
let clock: THREE.Clock | null = null
let prefersReducedMotion: MediaQueryList | null = null

interface EdgeObject {
  source: string
  target: string
  line: Line2
  maxLength: number
}

interface GraphPalette {
  background: THREE.Color
  blue: THREE.Color
  blue2: THREE.Color
  line: THREE.Color
  locked: THREE.Color
  surface: THREE.Color
  mastered: THREE.Color
}

function setLabelRef(id: string, element: Element | ComponentPublicInstance | null) {
  if (element instanceof HTMLElement) labelRefs.set(id, element)
  else labelRefs.delete(id)
}

function css(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function color(name: string, fallback: string): THREE.Color {
  const value = css(name) || fallback
  const result = new THREE.Color()
  try {
    result.setStyle(value)
  } catch {
    result.setStyle(fallback)
  }
  return result
}

function palette(): GraphPalette {
  return {
    background: color('--bg', '#f7f4ef'),
    blue: color('--blue', '#5ba3d9'),
    blue2: color('--blue-2', '#2e7fbb'),
    line: color('--graph-edge', '#a79986'),
    locked: color('--locked', '#c8c4bc'),
    surface: color('--graph-node-available-bg', '#ffffff'),
    mastered: color('--graph-node-mastered-bg', '#5ba3d9'),
  }
}

function makeRoundedRect(width: number, height: number, radius: number) {
  const shape = new THREE.Shape()
  const x = -width / 2
  const y = -height / 2
  shape.moveTo(x + radius, y)
  shape.lineTo(x + width - radius, y)
  shape.quadraticCurveTo(x + width, y, x + width, y + radius)
  shape.lineTo(x + width, y + height - radius)
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  shape.lineTo(x + radius, y + height)
  shape.quadraticCurveTo(x, y + height, x, y + height - radius)
  shape.lineTo(x, y + radius)
  shape.quadraticCurveTo(x, y, x + radius, y)
  return new THREE.ShapeGeometry(shape)
}

function makeSelectionRing(paletteValue: GraphPalette) {
  const width = NODE_WIDTH + 8
  const height = NODE_HEIGHT + 8
  const radius = NODE_RADIUS + 4
  const cornerSegments = 8
  const points: THREE.Vector3[] = [
    new THREE.Vector3(-width / 2 + radius, height / 2, 0.22),
    new THREE.Vector3(width / 2 - radius, height / 2, 0.22),
  ]
  const corners: [number, number, number, number][] = [
    [width / 2 - radius, height / 2 - radius, Math.PI / 2, 0],
    [width / 2 - radius, -height / 2 + radius, 0, -Math.PI / 2],
    [-width / 2 + radius, -height / 2 + radius, -Math.PI / 2, -Math.PI],
    [-width / 2 + radius, height / 2 - radius, Math.PI, Math.PI / 2],
  ]
  corners.forEach(([centerX, centerY, startAngle, endAngle], cornerIndex) => {
    for (let index = 1; index <= cornerSegments; index += 1) {
      const angle = startAngle + ((endAngle - startAngle) * index) / cornerSegments
      points.push(
        new THREE.Vector3(
          centerX + Math.cos(angle) * radius,
          centerY + Math.sin(angle) * radius,
          0.22,
        ),
      )
      if (cornerIndex === 0 && index === cornerSegments)
        points.push(new THREE.Vector3(width / 2, -height / 2 + radius, 0.22))
      if (cornerIndex === 1 && index === cornerSegments)
        points.push(new THREE.Vector3(-width / 2 + radius, -height / 2, 0.22))
      if (cornerIndex === 2 && index === cornerSegments)
        points.push(new THREE.Vector3(-width / 2, height / 2 - radius, 0.22))
    }
  })
  points.push(points[0].clone())

  const geometry = new LineGeometry()
  geometry.setPositions(points.flatMap((point) => [point.x, point.y, point.z]))
  const ring = new Line2(
    geometry,
    new LineMaterial({
      color: paletteValue.blue,
      transparent: true,
      opacity: 0.9,
      linewidth: 3,
      dashed: true,
      dashSize: 8,
      gapSize: 5,
    }),
  )
  ring.computeLineDistances()
  ring.visible = false
  return ring
}

function nodeWorldPosition(node: KNode) {
  if (layoutMode.value === 'mobile') {
    const mobilePosition = mobilePositions.get(node.id)
    if (mobilePosition)
      return { x: mobilePosition.x - world.centerX, y: world.centerY - mobilePosition.y }
  }
  const position = desktopPositions.get(node.id) ?? node
  return {
    x: (position.x - world.centerX) * layoutScale.x,
    y: (world.centerY - position.y) * layoutScale.y,
  }
}

function setWorldBounds() {
  desktopPositions.clear()
  if (layoutMode.value === 'mobile') {
    const levels = [...new Set(props.nodes.map((node) => node.y))].sort((a, b) => a - b)
    mobilePositions.clear()
    const rows: KNode[][] = []
    levels.forEach((level) => {
      const levelNodes = props.nodes.filter((node) => node.y === level).sort((a, b) => a.x - b.x)
      const rowCount = Math.ceil(levelNodes.length / 3)
      for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
        rows.push(levelNodes.filter((_, index) => index % rowCount === rowIndex))
      }
    })
    const rowSpacing = rows.length > 1 ? Math.max(100, 520 / (rows.length - 1)) : 0
    rows.forEach((row, rowIndex) => {
      const y = rows.length > 1 ? 140 + rowSpacing * rowIndex : 400
      row.forEach((node, index) => {
        mobilePositions.set(node.id, {
          x: row.length > 1 ? 65 + (260 * index) / (row.length - 1) : 195,
          y,
        })
      })
    })
    const lastY = rows.length > 1 ? 140 + rowSpacing * (rows.length - 1) : 400
    world.width = 390
    world.height = Math.max(800, lastY - 140 + 280)
    world.centerX = 195
    world.centerY = rows.length > 1 ? (140 + lastY) / 2 : 400
    return
  }
  if (props.nodes.length === 0) {
    world.width = 1100
    world.height = 720
    world.centerX = 0
    world.centerY = 0
    return
  }
  graphDesktopPositions(props.nodes, props.edges).forEach((position, id) =>
    desktopPositions.set(id, position),
  )
  const positions = props.nodes.map((node) => desktopPositions.get(node.id) ?? node)
  const xs = positions.map((node) => node.x)
  const ys = positions.map((node) => node.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  world.centerX = (minX + maxX) / 2
  world.centerY = (minY + maxY) / 2
  world.width = Math.max(1100, maxX - minX + 240)
  world.height = Math.max(720, maxY - minY + 240)
}

function updateLayoutScale(viewport: GraphViewport, minimumVisibleWidth: number) {
  const nextScale =
    layoutMode.value === 'desktop'
      ? graphLayoutScale(
          props.nodes.map((node) => desktopPositions.get(node.id) ?? node),
          viewport,
          { width: NODE_WIDTH, height: NODE_HEIGHT, padding: GRAPH_VIEW_PADDING },
          minimumVisibleWidth,
        )
      : { x: 1, y: 1 }

  const changed =
    Math.abs(layoutScale.x - nextScale.x) > 0.01 || Math.abs(layoutScale.y - nextScale.y) > 0.01
  if (changed) {
    layoutScale.x = nextScale.x
    layoutScale.y = nextScale.y
  }
  return changed
}

function graphContentBounds() {
  if (nodeObjects.size === 0) return { width: world.width, height: world.height }

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  nodeObjects.forEach((group) => {
    const scale = group.scale.x || 1
    const halfWidth = (NODE_WIDTH * scale) / 2
    const halfHeight = (NODE_HEIGHT * scale) / 2
    minX = Math.min(minX, group.position.x - halfWidth)
    maxX = Math.max(maxX, group.position.x + halfWidth)
    minY = Math.min(minY, group.position.y - halfHeight)
    maxY = Math.max(maxY, group.position.y + halfHeight)
  })

  return {
    width: maxX - minX + GRAPH_VIEW_PADDING * 2,
    height: maxY - minY + GRAPH_VIEW_PADDING * 2,
  }
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if ('geometry' in child && child.geometry instanceof THREE.BufferGeometry)
      child.geometry.dispose()
    if ('material' in child) {
      const material = child.material
      if (Array.isArray(material)) material.forEach((item) => item.dispose())
      else if (material instanceof THREE.Material) material.dispose()
    }
  })
}

function clearScene() {
  scene.children.slice().forEach((child) => {
    scene.remove(child)
    disposeObject(child)
  })
  nodeObjects.clear()
  edgeObjects.splice(0)
}

function makeNode(node: KNode, colors: GraphPalette) {
  const group = new THREE.Group()
  const position = nodeWorldPosition(node)
  group.position.set(position.x, position.y, 0)
  group.userData.nodeId = node.id
  group.userData.baseX = position.x
  group.userData.baseY = position.y
  group.userData.homeX = position.x
  group.userData.homeY = position.y
  group.userData.phase = node.id.length * 0.73
  group.userData.state = node.state

  const fill =
    node.state === 'mastered'
      ? colors.mastered
      : node.state === 'available'
        ? colors.surface
        : colors.locked
  const stroke =
    node.state === 'mastered'
      ? colors.blue2
      : node.state === 'available'
        ? colors.blue
        : colors.locked
  const body = new THREE.Mesh(
    makeRoundedRect(NODE_WIDTH, NODE_HEIGHT, NODE_RADIUS),
    new THREE.MeshBasicMaterial({
      color: fill,
      transparent: true,
      opacity: node.state === 'locked' ? 0.55 : 0.96,
    }),
  )
  body.userData.nodeId = node.id
  const mask = new THREE.Mesh(
    body.geometry,
    new THREE.MeshBasicMaterial({ color: colors.background }),
  )
  mask.position.z = -0.1
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(body.geometry),
    new THREE.LineBasicMaterial({
      color: stroke,
      transparent: true,
      opacity: node.state === 'locked' ? 0.5 : 0.95,
    }),
  )
  outline.scale.set(1.005, 1.005, 1.005)
  const selectionRing = makeSelectionRing(colors)

  group.add(mask, body, outline, selectionRing)
  group.userData.body = body
  group.userData.mask = mask
  group.userData.outline = outline
  group.userData.selectionRing = selectionRing
  scene.add(group)
  nodeObjects.set(node.id, group)
}

function makeEdge(source: string, target: string, colors: GraphPalette) {
  const from = props.nodes.find((node) => node.id === source)
  const to = props.nodes.find((node) => node.id === target)
  if (!from || !to) return
  const start = nodeWorldPosition(from)
  const end = nodeWorldPosition(to)
  const dx = end.x - start.x
  const dy = end.y - start.y
  const curve = new THREE.CubicBezierCurve3(
    new THREE.Vector3(start.x, start.y, -0.2),
    new THREE.Vector3(start.x + dx * 0.1, start.y + dy * 0.55, -0.2),
    new THREE.Vector3(end.x - dx * 0.1, end.y - dy * 0.55, -0.2),
    new THREE.Vector3(end.x, end.y, -0.2),
  )
  const points = curve.getPoints(EDGE_SAMPLES)
  const geometry = new LineGeometry()
  geometry.setPositions(points.flatMap((point) => [point.x, point.y, point.z]))
  const positionBuffer = (
    geometry.getAttribute('instanceStart') as THREE.InterleavedBufferAttribute
  ).data
  positionBuffer.setUsage(THREE.DynamicDrawUsage)
  const line = new Line2(
    geometry,
    new LineMaterial({
      color: colors.line,
      linewidth: 3,
    }),
  )
  scene.add(line)
  edgeObjects.push({
    source,
    target,
    line,
    maxLength: 0,
  })
}

function updateEdge(edge: EdgeObject) {
  const from = nodeObjects.get(edge.source)?.position
  const to = nodeObjects.get(edge.target)?.position
  if (!from || !to) return
  const dx = to.x - from.x
  const dy = to.y - from.y
  const curve = new THREE.CubicBezierCurve3(
    new THREE.Vector3(from.x, from.y, -0.2),
    new THREE.Vector3(from.x + dx * 0.1, from.y + dy * 0.55, -0.2),
    new THREE.Vector3(to.x - dx * 0.1, to.y - dy * 0.55, -0.2),
    new THREE.Vector3(to.x, to.y, -0.2),
  )
  const points = curve.getPoints(EDGE_SAMPLES)
  const buffer = (
    edge.line.geometry.getAttribute('instanceStart') as THREE.InterleavedBufferAttribute
  ).data
  for (let index = 0; index < EDGE_SAMPLES; index += 1) {
    const offset = index * 6
    const start = points[index]
    const end = points[index + 1]
    buffer.array.set([start.x, start.y, start.z, end.x, end.y, end.z], offset)
  }
  buffer.needsUpdate = true
  edge.line.geometry.computeBoundingSphere()
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

function connectedNode(clientX: number, clientY: number): string | null {
  if (!renderer.value) return null
  const rect = renderer.value.domElement.getBoundingClientRect()
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const hits = raycaster.intersectObjects(
    [...nodeObjects.values()].map((group) => group.userData.body),
    false,
  )
  return hits[0]?.object.userData.nodeId ?? null
}

function screenToWorld(clientX: number, clientY: number) {
  if (!renderer.value) return new THREE.Vector3()
  const rect = renderer.value.domElement.getBoundingClientRect()
  return new THREE.Vector3(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
    0,
  ).unproject(camera)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function boundedPosition(id: string, x: number, y: number) {
  const group = nodeObjects.get(id)
  if (!group) return { x, y }
  const mobile = layoutMode.value === 'mobile'
  const halfWidth = (NODE_WIDTH * (mobile ? MOBILE_NODE_SCALE : 1)) / 2
  const tierRange = mobile ? 46 : 58
  const minSeparation = mobile ? 85 : 92
  let minY = group.userData.homeY - tierRange
  let maxY = group.userData.homeY + tierRange
  edgeObjects.forEach((edge) => {
    if (edge.target === id)
      maxY = Math.min(maxY, nodeObjects.get(edge.source)?.userData.baseY - minSeparation)
    if (edge.source === id)
      minY = Math.max(minY, nodeObjects.get(edge.target)?.userData.baseY + minSeparation)
  })
  if (minY > maxY) return { x: group.userData.baseX, y: group.userData.baseY }
  const nextY = clamp(y, minY, maxY)
  let minX = -world.width / 2 + halfWidth
  let maxX = world.width / 2 - halfWidth
  edgeObjects.forEach((edge) => {
    if (edge.source !== id && edge.target !== id) return
    const otherId = edge.source === id ? edge.target : edge.source
    const other = nodeObjects.get(otherId)
    if (!other) return
    const dy = nextY - other.userData.baseY
    const span = Math.sqrt(Math.max(0, edge.maxLength ** 2 - dy ** 2))
    minX = Math.max(minX, other.userData.baseX - span)
    maxX = Math.min(maxX, other.userData.baseX + span)
  })
  if (minX > maxX) return { x: group.userData.baseX, y: group.userData.baseY }
  return { x: clamp(x, minX, maxX), y: nextY }
}

function isClear(id: string, x: number, y: number) {
  const scale = layoutMode.value === 'mobile' ? MOBILE_NODE_SCALE : 1
  const minWidth = NODE_WIDTH * scale + 4
  const minHeight = NODE_HEIGHT * scale + 4
  for (const [otherId, other] of nodeObjects) {
    if (otherId === id) continue
    if (
      Math.abs(x - other.userData.baseX) < minWidth &&
      Math.abs(y - other.userData.baseY) < minHeight
    )
      return false
  }
  return true
}

function moveNode(id: string, x: number, y: number) {
  const group = nodeObjects.get(id)
  if (!group) return
  const bounded = boundedPosition(id, x, y)
  const candidates = [
    bounded,
    boundedPosition(id, group.userData.baseX, bounded.y),
    boundedPosition(id, bounded.x, group.userData.baseY),
  ]
  const next = candidates.find((candidate) => isClear(id, candidate.x, candidate.y))
  if (!next) return
  group.userData.baseX = next.x
  group.userData.baseY = next.y
  group.position.set(next.x, next.y, 0)
  edgeObjects.filter((edge) => edge.source === id || edge.target === id).forEach(updateEdge)
}

function updateHover(id: string | null) {
  if (hoveredId.value === id) return
  hoveredId.value = id
  updateFocus()
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0 || !renderer.value) return
  draggedNodeId = connectedNode(event.clientX, event.clientY)
  dragMode = draggedNodeId ? 'node' : 'pan'
  nodeWasDragged = false
  dragStart = { x: event.clientX, y: event.clientY }
  dragStartWorld = screenToWorld(event.clientX, event.clientY)
  offsetStart = { ...viewOffset }
  if (draggedNodeId) {
    const group = nodeObjects.get(draggedNodeId)
    if (!group) return
    nodeStart = { x: group.userData.baseX, y: group.userData.baseY }
  }
  renderer.value.domElement.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  if (!renderer.value) return
  const id = dragMode === 'node' ? draggedNodeId : connectedNode(event.clientX, event.clientY)
  updateHover(id)
  renderer.value.domElement.style.cursor =
    dragMode === 'node' ? 'grabbing' : id ? 'move' : dragMode === 'pan' ? 'grabbing' : 'grab'
  if (dragMode === 'node' && draggedNodeId && nodeStart && dragStartWorld) {
    if (Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y) >= 4)
      nodeWasDragged = true
    if (!nodeWasDragged) return
    const current = screenToWorld(event.clientX, event.clientY)
    moveNode(
      draggedNodeId,
      nodeStart.x + current.x - dragStartWorld.x,
      nodeStart.y + current.y - dragStartWorld.y,
    )
  } else if (dragMode === 'pan' && renderer.value) {
    const rect = renderer.value.domElement.getBoundingClientRect()
    const worldPerPixel = (camera.right - camera.left) / (rect.width * viewScale.value)
    viewOffset.x = offsetStart.x - (event.clientX - dragStart.x) * worldPerPixel
    viewOffset.y = offsetStart.y + (event.clientY - dragStart.y) * worldPerPixel
  }
}

function onPointerUp(event: PointerEvent) {
  if (!renderer.value || !dragMode) return
  const clickedNodeId = dragMode === 'node' && !nodeWasDragged ? draggedNodeId : null
  dragMode = null
  draggedNodeId = null
  nodeWasDragged = false
  nodeStart = null
  dragStartWorld = null
  if (renderer.value.domElement.hasPointerCapture(event.pointerId))
    renderer.value.domElement.releasePointerCapture(event.pointerId)
  if (clickedNodeId) {
    clickSequence.push(clickedNodeId)
    if (clickSequence.length > 2) clickSequence.shift()
    activeId.value = clickedNodeId
    const node = props.nodes.find((item) => item.id === clickedNodeId)
    if (node) emit('select', node)
    updateFocus()
  } else clickSequence.length = 0
  updateHover(connectedNode(event.clientX, event.clientY))
  renderer.value.domElement.style.cursor = hoveredId.value ? 'move' : 'grab'
}

function onDoubleClick(event: MouseEvent) {
  if (event.button !== 0) return
  const nodeId = connectedNode(event.clientX, event.clientY)
  if (nodeId && clickSequence.length === 2 && clickSequence.every((id) => id === nodeId)) {
    const node = props.nodes.find((item) => item.id === nodeId)
    if (node) emit('activate', node)
  }
  clickSequence.length = 0
}

function onPointerCancel() {
  dragMode = null
  draggedNodeId = null
  nodeWasDragged = false
  clickSequence.length = 0
  nodeStart = null
  dragStartWorld = null
  updateHover(null)
}

function onPointerLeave() {
  if (!dragMode) updateHover(null)
}

function onWheel(event: WheelEvent) {
  event.preventDefault()
  viewScale.value = clamp(viewScale.value + (event.deltaY > 0 ? -0.08 : 0.08), 0.72, 1.55)
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
