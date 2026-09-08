// 类型定义，知识图谱、主题、消息结构和对话Session
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
  messageType?: import('./learningAgent').StructuredMessageType
  metadata?: Record<string, unknown> | null
}

export type ChatMode = 'socratic' | 'normal'

export interface DialogueSession {
  id: string
  name: string
  messages: Message[]
  updatedAt: string
  topicId?: number
  topicTitle?: string
  awaitingTopicChoice?: boolean
  suggestedTopicId?: number
  suggestedTopicTitle?: string
}
