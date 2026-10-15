import * as THREE from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import type { KNode, KEdge } from '../../types'
export const NODE_WIDTH = 190

export const NODE_HEIGHT = 82

export const NODE_RADIUS = 14

export const EDGE_SAMPLES = 32

export const GRAPH_VIEW_PADDING = 32

export const MOBILE_NODE_SCALE = 0.6

export interface EdgeObject {
  source: string
  target: string
  line: Line2
  maxLength: number
}

export interface GraphPalette {
  background: THREE.Color
  blue: THREE.Color
  blue2: THREE.Color
  line: THREE.Color
  locked: THREE.Color
  surface: THREE.Color
  mastered: THREE.Color
}
export interface GraphProps {
  nodes: KNode[]
  edges: KEdge[]
  selectedId?: string | null
  themeKey?: string
}
export interface GraphEmit {
  (event: 'select', node: KNode): void
  (event: 'activate', node: KNode): void
}
