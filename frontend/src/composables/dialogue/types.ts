import type { Message } from '../../types'
import type { ChatKind, ChatQuote } from '../../api/chat'
import type { WebSnapshot } from '../../types/webSearch'

export interface StreamContext {
  epoch: number
  sessionId: string
  requestId: string
  controller: AbortController
  replacing: boolean
  retry?: () => void
  userMessage?: Message
  onRecovered?: (ids: { user: number; ai: number }) => void
  onPartial?: (message: Message) => void
  onCancelled?: (ids?: { user: number; ai: number }) => void
  cancelled?: boolean
  web?: WebSnapshot
}

export interface DialogueRequest {
  nodeKey: string
  topicId: number
  input: string
  mode: 'normal' | 'socratic'
  style: string
  kind?: ChatKind
  quote?: ChatQuote
  userMessage?: Message
  replaceMessage?: Message
  regenerateMessageId?: number
  requestId?: string
  modelId?: string | null
  attachmentIds?: string[]
  attachmentScopeKey?: string
}
