import * as THREE from 'three'
import { NODE_WIDTH, MOBILE_NODE_SCALE, NODE_HEIGHT, type GraphEmit } from './graphSceneTypes'
import type { GraphSceneState } from './createGraphSceneState'
import type { createGraphObjects } from './createGraphObjects'

type Context = Pick<
  GraphSceneState,
  | 'renderer'
  | 'pointer'
  | 'raycaster'
  | 'camera'
  | 'nodeObjects'
  | 'layoutMode'
  | 'edgeObjects'
  | 'world'
  | 'hoveredId'
  | 'viewOffset'
  | 'viewScale'
  | 'activeId'
  | 'props'
> &
  Pick<ReturnType<typeof createGraphObjects>, 'updateEdge'> & { emit: GraphEmit } & {
    updateFocus: () => void
  }
export function createGraphInteractions(context: Context) {
  const {
    renderer,
    pointer,
    raycaster,
    camera,
    nodeObjects,
    layoutMode,
    edgeObjects,
    world,
    hoveredId,
    viewOffset,
    viewScale,
    activeId,
    props,
    updateEdge,
    emit,
    updateFocus,
  } = context
  let dragMode: 'node' | 'pan' | null = null

  let draggedNodeId: string | null = null

  let nodeWasDragged = false

  const clickSequence: string[] = []

  let dragStart = { x: 0, y: 0 }

  let dragStartWorld: THREE.Vector3 | null = null

  let nodeStart: { x: number; y: number } | null = null

  let offsetStart = { x: 0, y: 0 }

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
  return {
    connectedNode,
    screenToWorld,
    clamp,
    boundedPosition,
    isClear,
    moveNode,
    updateHover,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onDoubleClick,
    onPointerCancel,
    onPointerLeave,
    onWheel,
  }
}
