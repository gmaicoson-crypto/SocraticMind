// 知识节点状态：已掌握 / 可学习 / 未解锁
export type NodeState = 'mastered' | 'available' | 'locked'

// 知识图谱中的节点
export interface KNode {
  id: string
  label: string
  sub: string
  x: number
  y: number
  state: NodeState
  dbId?: number
}

// 知识图谱中的有向边
export interface KEdge {
  source: string
  target: string
}

// 学习主题
export interface Topic {
  id: string
  title: string
  nodes: number
  mastered: number
  emoji: string
}

// 对话消息
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
