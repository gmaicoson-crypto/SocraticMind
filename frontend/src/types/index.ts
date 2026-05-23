// 前端共享类型定义，统一描述知识图谱、主题和消息结构。
export type NodeState = 'mastered' | 'available' | 'locked'

export interface KNode {
  id: string
  label: string
  sub: string
  x: number
  y: number
  state: NodeState
  dbId?: number
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
  db_id?: number
  paired_db_id?: number
  choices?: { label: string; text: string }[]
  selected_choice?: string
}
