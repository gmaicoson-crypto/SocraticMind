export type NodeState = 'mastered' | 'available' | 'locked'

export interface KNode {
  id: string
  label: string
  sub: string
  x: number
  y: number
  state: NodeState
  dbId?: number  // 数据库 id
}

export interface KEdge {
  source: string
  target: string
}

export interface Topic {
  id: string
  title: string
  nodes: number
  mastered: number
  emoji: string
}

export interface Message {
  role: 'ai' | 'user'
  text: string
  time: string
  quote?: string
}