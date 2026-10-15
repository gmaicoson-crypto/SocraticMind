import { ref, shallowRef, type Ref } from 'vue'
import type { EdgeObject, GraphProps } from './graphSceneTypes'
import * as THREE from 'three'

export function createGraphSceneState(
  props: GraphProps,
  hostRef: Ref<HTMLDivElement | null>,
  canvasRef: Ref<HTMLCanvasElement | null>,
) {
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

  const renderer = shallowRef<THREE.WebGLRenderer | null>(null)

  const viewScale = ref(1)

  const viewOffset = { x: 0, y: 0 }

  const layoutScale = { x: 1, y: 1 }

  const hoveredId = ref<string | null>(null)

  const layoutMode = ref<'desktop' | 'mobile'>('desktop')
  return {
    props,
    hostRef,
    canvasRef,
    labelRefs,
    activeId,
    world,
    mobilePositions,
    desktopPositions,
    nodeObjects,
    edgeObjects,
    scene,
    camera,
    pointer,
    raycaster,
    renderer,
    viewScale,
    viewOffset,
    layoutScale,
    hoveredId,
    layoutMode,
  }
}
export type GraphSceneState = ReturnType<typeof createGraphSceneState>
