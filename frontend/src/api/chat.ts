// chat 接口模块，封装后端请求方法。

import api from './index'
import { getToken } from '../utils/token'
import { getSelectedModelId } from '../utils/modelSelection'
import type { AttachmentSummary, AttachmentContextEvent } from '../types/attachments'
import type { WebEvent } from '../types/webSearch'

export interface ChatMessage {
  attachments?: AttachmentSummary[]
  role: 'ai' | 'user'
  content: string
}

export interface StoredChatMessage extends ChatMessage {
  id: number
  node_key: string
  mode: string
  topic_id: number | null
  session_id: string
  message_type: import('../types/learningAgent').StructuredMessageType
  metadata: Record<string, unknown> | null
  created_at: string
}

export type ChatKind = 'qa' | 'topic_overview' | 'node_overview'
export type ChatContextStatus = 'compacting' | 'ready'

export interface ChatQuote {
  text: string
  sourceId?: number
}

export class ChatStreamError extends Error {
  readonly code: string
  readonly retryable?: boolean

  constructor(message: string, code: string, retryable?: boolean) {
    super(message)
    this.name = 'ChatStreamError'
    this.code = code
    this.retryable = retryable
  }
}

function streamError(value: unknown, fallback = '连接失败，请重试。'): ChatStreamError {
  if (typeof value === 'string') return new ChatStreamError(value, 'CHAT_STREAM_ERROR')
  if (value && typeof value === 'object') {
    const detail = value as {
      detail?: unknown
      message?: string
      code?: string
      retryable?: boolean
    }
    if (detail.detail) return streamError(detail.detail, fallback)
    return new ChatStreamError(
      detail.message || fallback,
      detail.code || 'CHAT_STREAM_ERROR',
      detail.retryable,
    )
  }
  return new ChatStreamError(fallback, 'CHAT_STREAM_ERROR')
}

export interface CancelChatResponse {
  status: string
  msg_ids?: { user: number; ai: number }
}

export async function cancelChatStream(
  sessionId: string,
  requestId: string,
): Promise<CancelChatResponse> {
  const response = await api.post<CancelChatResponse>('/api/chat/cancel', {
    session_id: sessionId,
    request_id: requestId,
  })
  return response.data
}

export interface ChatStreamRequest {
  nodeKey: string
  topicId: number
  sessionId: string
  userInput: string
  requestId: string
  mode: 'socratic' | 'normal'
  aiStyle: string
  controller?: AbortController
  kind?: ChatKind
  quote?: ChatQuote
  regenerateMessageId?: number
  modelId?: string | null
  attachmentIds?: string[]
}

export interface ChatStreamCallbacks {
  onChunk: (text: string) => void
  onDone: () => void
  onError: (err: unknown) => void
  onMsgIds?: (userMsgId: number, aiMsgId: number) => void
  onContextStatus?: (status: ChatContextStatus) => void
  onAttachmentContext?: (event: AttachmentContextEvent) => void
  onWebEvent?: (event: WebEvent) => void
}

export async function chatStream(request: ChatStreamRequest, callbacks: ChatStreamCallbacks) {
  const {
    nodeKey,
    topicId,
    sessionId,
    userInput,
    requestId,
    mode,
    aiStyle,
    kind = 'qa',
    quote,
    regenerateMessageId,
    modelId = getSelectedModelId(),
  } = request
  const { onChunk, onDone, onError, onMsgIds, onContextStatus, onWebEvent } = callbacks
  const controller = request.controller ?? new AbortController()
  let aiMessageId: number | undefined
  const model = modelId
  let terminalEventSent = false
  let failedState: ChatStreamError | null = null
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null

  function notifyDone() {
    if (terminalEventSent) return
    if (failedState) return notifyError(failedState)
    terminalEventSent = true
    onDone()
  }

  function notifyError(error: unknown) {
    if (terminalEventSent) return
    terminalEventSent = true
    onError(error)
  }

  const timeout = setTimeout(
    () => {
      notifyError(new ChatStreamError('等待回复超时，请重试。', 'CHAT_STREAM_TIMEOUT'))
      controller.abort()
      void cancelChatStream(sessionId, requestId).catch(() => {})
    },
    5 * 60 * 1000,
  )
  const onAbort = () => {
    clearTimeout(timeout)
    void reader?.cancel().catch(() => {})
  }
  controller.signal.addEventListener('abort', onAbort, { once: true })

  try {
    const response = await fetch(`${import.meta.env.VITE_API_BASE}/api/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({
        node_key: nodeKey,
        topic_id: topicId,
        session_id: sessionId,
        user_input: userInput,
        request_id: requestId,
        mode,
        ai_style: aiStyle,
        attachment_ids: request.attachmentIds ?? [],
        kind,
        ...(quote ? { quote_text: quote.text, quote_source_id: quote.sourceId } : {}),
        ...(model ? { model } : {}),
        ...(regenerateMessageId != null ? { regenerate_message_id: regenerateMessageId } : {}),
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      const error = await response.json().catch(() => null)
      if (error?.msg_ids) onMsgIds?.(error.msg_ids.user, error.msg_ids.ai)
      throw streamError(error, `请求失败（HTTP ${response.status}），请重试。`)
    }
    if (!response.body) throw new ChatStreamError('服务器未返回回复流。', 'CHAT_STREAM_EMPTY')
    reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    function processEvent(event: string) {
      for (const line of event.split('\n')) {
        if (terminalEventSent || controller.signal.aborted) return
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (!data) continue
        if (data === '[DONE]') {
          notifyDone()
          return
        }
        let json
        try {
          json = JSON.parse(data)
        } catch {
          throw new ChatStreamError('回复流格式错误，请重试。', 'CHAT_STREAM_INVALID')
        }
        if (
          [
            'attachment_context_preparing',
            'attachment_context_progress',
            'attachment_context_ready',
          ].includes(json.type) &&
          json.request_id === requestId &&
          json.ai_message_id === aiMessageId
        )
          callbacks.onAttachmentContext?.(json)
        if (json.type === 'context_compacting') onContextStatus?.('compacting')
        if (json.type === 'context_ready') onContextStatus?.('ready')
        if (json.msg_ids) {
          aiMessageId = json.msg_ids.ai
          onMsgIds?.(json.msg_ids.user, json.msg_ids.ai)
        }
        if (['web_status', 'web_sources', 'web_warning'].includes(json.type)) {
          if (
            json.request_id === requestId &&
            typeof json.ai_message_id === 'number' &&
            aiMessageId === json.ai_message_id &&
            json.web?.schema_version === 1 &&
            Array.isArray(json.web.sources) &&
            Array.isArray(json.web.cited_source_ids)
          )
            onWebEvent?.(json as WebEvent)
        }
        if (json.text) onChunk(json.text)
        if (json.error) notifyError(streamError(json.error))
        const status = json.request_state?.status
        if (status === 'complete') notifyDone()
        if (status === 'failed' || status === 'interrupted') {
          failedState = streamError(
            json.request_state.error,
            status === 'interrupted' ? '回复已中断，可重新生成。' : '回复失败，请重试。',
          )
        }
      }
    }

    while (!terminalEventSent && !controller.signal.aborted) {
      const { done, value } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      buffer = buffer.replace(/\r\n/g, '\n')
      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''
      for (const event of events) processEvent(event)
      if (done) {
        if (buffer.trim()) processEvent(buffer)
        if (!terminalEventSent && !controller.signal.aborted) {
          notifyError(
            failedState ??
              new ChatStreamError('连接意外中断，请重试恢复回复。', 'CHAT_STREAM_DISCONNECTED'),
          )
        }
        break
      }
    }
  } catch (error) {
    if (!controller.signal.aborted) notifyError(error)
  } finally {
    clearTimeout(timeout)
    controller.signal.removeEventListener('abort', onAbort)
    await reader?.cancel().catch(() => {})
  }
}

export async function getChatHistory(nodeKey: string) {
  const res = await api.get(`/api/chat/history/${nodeKey}`)
  return res.data as StoredChatMessage[]
}

export async function getAllMessages(limit = 200, offset = 0) {
  const res = await api.get(`/api/chat/messages?limit=${limit}&offset=${offset}`)
  return res.data as StoredChatMessage[]
}

type ChatDeleteEndpoint = '/api/chat/messages' | '/api/chat/session'

async function deleteChatResource(endpoint: ChatDeleteEndpoint, data: object) {
  const res = await api.delete<{ deleted?: number | string }>(endpoint, { data })
  return Number(res.data.deleted ?? 0)
}

export async function deleteMessages(ids: number[]) {
  if (ids.length === 0) return 0
  return deleteChatResource('/api/chat/messages', { ids })
}

export async function deleteChatSession(sessionId: string) {
  return deleteChatResource('/api/chat/session', {
    session_id: sessionId,
  })
}

export async function uploadChatAvatar(sessionId: string, file: File): Promise<string> {
  const form = new FormData()
  form.append('session_id', sessionId)
  form.append('file', file)
  const res = await api.post<{ avatar_url: string }>('/api/chat/avatar', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data.avatar_url
}

export async function deleteChatAvatar(sessionId: string): Promise<void> {
  await api.delete('/api/chat/avatar', { data: { session_id: sessionId } })
}

export interface SuggestionsResponse {
  suggestions: string[]
  source?: 'ai' | 'fallback'
}

export interface SuggestionsContext {
  topicId?: number
  sessionId?: string
  nodeKey?: string
}

export async function getSuggestions(
  mode: 'socratic' | 'normal',
  exclude: string[] = [],
  context?: SuggestionsContext,
): Promise<SuggestionsResponse> {
  const model = getSelectedModelId()
  const params = new URLSearchParams({ mode })
  if (model) params.set('model', model)
  if (context?.sessionId) params.set('session_id', context.sessionId)
  if (mode === 'socratic' && context?.topicId) {
    params.set('topic_id', String(context.topicId))
    if (context.nodeKey) params.set('node_key', context.nodeKey)
  }
  for (const value of exclude) params.append('exclude', value)
  const res = await api.get<SuggestionsResponse>('/api/chat/suggestions', { params })
  return res.data
}

export interface ChatRequestState {
  request_id: string
  session_id?: string
  status: string
  msg_ids?: { user: number; ai: number }
  preparation?: { completed?: number; total?: number; status?: string }
  error?: { code?: string; message?: string; retryable?: boolean }
}
export async function getChatRequestState(requestId: string): Promise<ChatRequestState> {
  return (await api.get(`/api/chat/requests/${encodeURIComponent(requestId)}`)).data
}
