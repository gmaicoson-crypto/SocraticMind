import { afterEach, describe, expect, it, vi } from 'vitest'
import { isProxy, ref } from 'vue'
import * as THREE from 'three'
import type { KNode } from '../../../types'
import { createGraphSceneState } from '../createGraphSceneState'
import { createGraphLayout } from '../createGraphLayout'
import { createGraphObjects } from '../createGraphObjects'
import { createGraphInteractions } from '../createGraphInteractions'
import { palette } from '../graphAppearance'

afterEach(() => vi.restoreAllMocks())

function scene() {
  const nodes: KNode[] = [
    { id: 'root', label: 'Root', sub: '', x: 0, y: 0, state: 'mastered' },
    { id: 'child', label: 'Child', sub: '', x: 0, y: 180, state: 'available' },
  ]
  const state = createGraphSceneState(
    { nodes, edges: [{ source: 'root', target: 'child' }] },
    ref(null),
    ref(null),
  )
  const layout = createGraphLayout(state)
  const objects = createGraphObjects({ ...state, ...layout })
  layout.setWorldBounds()
  nodes.forEach((node) => objects.makeNode(node, palette()))
  objects.makeEdge('root', 'child', palette())
  return { state, layout, objects, nodes }
}

describe('graph scene boundaries', () => {
  it('keeps desktop and mobile positions finite and preserves the prerequisite order', () => {
    const { state, layout, objects, nodes } = scene()
    const desktop = nodes.map(layout.nodeWorldPosition)
    expect(desktop[0].y).toBeGreaterThan(desktop[1].y)
    state.layoutMode.value = 'mobile'
    layout.setWorldBounds()
    const mobile = nodes.map(layout.nodeWorldPosition)
    expect(mobile.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true)
    expect(mobile[0].x).toBe(0)
    expect(mobile[0].y).toBeGreaterThan(mobile[1].y)
    objects.clearScene()
  })

  it('releases geometry, materials, edges and node references when rebuilding a scene', () => {
    const { state, objects } = scene()
    const body = state.nodeObjects.get('root')!.userData.body as THREE.Mesh
    const geometry = vi.spyOn(body.geometry, 'dispose')
    const material = vi.spyOn(body.material as THREE.Material, 'dispose')
    const edgeGeometry = vi.spyOn(state.edgeObjects[0].line.geometry, 'dispose')
    objects.clearScene()
    expect(geometry).toHaveBeenCalled()
    expect(material).toHaveBeenCalledOnce()
    expect(edgeGeometry).toHaveBeenCalledOnce()
    expect(state.scene.children).toHaveLength(0)
    expect(state.nodeObjects.size).toBe(0)
    expect(state.edgeObjects).toHaveLength(0)
    expect(() => objects.clearScene()).not.toThrow()
  })

  it('keeps renderer identity and distinguishes clicks, dragging and cancelled gestures', () => {
    const { state, objects } = scene()
    const canvas = document.createElement('canvas')
    canvas.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600)
    canvas.setPointerCapture = vi.fn()
    canvas.hasPointerCapture = vi.fn(() => true)
    canvas.releasePointerCapture = vi.fn()
    const renderer = { domElement: canvas } as THREE.WebGLRenderer
    state.renderer.value = renderer
    expect(state.renderer.value).toBe(renderer)
    expect(isProxy(state.renderer.value)).toBe(false)
    const body = state.nodeObjects.get('root')!.userData.body as THREE.Object3D
    vi.spyOn(state.raycaster, 'intersectObjects').mockReturnValue([
      { object: body } as THREE.Intersection,
    ])
    const emit = vi.fn()
    const interaction = createGraphInteractions({
      ...state,
      ...objects,
      emit,
      updateFocus: vi.fn(),
    })
    const pointer = (x: number) =>
      new MouseEvent('pointer', { button: 0, clientX: x, clientY: 20 }) as PointerEvent
    for (let i = 0; i < 2; i++) {
      interaction.onPointerDown(pointer(20))
      interaction.onPointerUp(pointer(20))
    }
    interaction.onDoubleClick(pointer(20))
    expect(emit.mock.calls.map(([event]) => event)).toEqual(['select', 'select', 'activate'])
    emit.mockClear()
    interaction.onPointerDown(pointer(20))
    interaction.onPointerMove(pointer(40))
    interaction.onPointerUp(pointer(40))
    interaction.onDoubleClick(pointer(40))
    expect(emit).not.toHaveBeenCalled()
    interaction.onPointerDown(pointer(20))
    interaction.onPointerCancel()
    interaction.onPointerUp(pointer(20))
    expect(emit).not.toHaveBeenCalled()
    interaction.onWheel(new WheelEvent('wheel', { deltaY: 100000 }))
    expect(state.viewScale.value).toBeGreaterThanOrEqual(0.72)
    objects.clearScene()
  })
})
