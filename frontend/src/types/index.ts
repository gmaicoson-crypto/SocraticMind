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
  estimatedMinutes?: number
  masterySource?: 'assessment' | 'self_reported' | 'legacy' | null
  masteryConfidence?: number | null
  assessmentResult?: import('./learningAgent').AssessmentResult | null
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
  attachments?: import('./attachments').AttachmentSummary[]
  quote?: string
  local_id?: string
  quote_source_db_id?: number
  quote_source_local_id?: string
  db_id?: number
  paired_db_id?: number
  chatRequest?: {
    nodeKey: string
    input: string
    kind: 'qa' | 'topic_overview' | 'node_overview'
    userMessageId?: number
    attachmentIds?: string[]
  }
  choices?: { label: string; text: string }[]
  selected_choice?: string
  messageType?: import('./learningAgent').StructuredMessageType
  metadata?: Record<string, unknown> | null
}

export type ChatMode = 'socratic' | 'normal'

export interface DialogueSession {
  id: string
  // In-memory display value fetched from the server; excluded from browser persistence.
  name: string
  aiAvatarUrl?: string
  aiAvatarSelected?: boolean
  messages: Message[]
  updatedAt: string
  topicId?: number
  topicTitle?: string
  awaitingTopicChoice?: boolean
  suggestedTopicId?: number
  suggestedTopicTitle?: string
}
