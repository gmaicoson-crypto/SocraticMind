// chat 接口模块，封装后端请求方法。

import api from './index'
import { getToken } from '../utils/token'

export interface ChatMessage {
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

export function chatStream(
  nodeKey: string,
  topicId: number,
  sessionId: string,
  userInput: string,
  history: ChatMessage[],
  mode: 'socratic' | 'normal',
  aiStyle: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: any) => void,
  controllers?: AbortController,
  onMsgIds?: (userMsgId: number, aiMsgId: number) => void,
  kind: ChatKind = 'qa',
) {
  const token = getToken()
  const controller = controllers ?? new AbortController()

  const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000)

  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null

  const originalAbort = controller.abort.bind(controller)
  controller.abort = () => {
    originalAbort()
    reader?.cancel().catch(() => {})
  }

  fetch(`${import.meta.env.VITE_API_BASE}/api/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      node_key: nodeKey,
      topic_id: topicId,
      session_id: sessionId,
      user_input: userInput,
      history: history.map(m => ({ role: m.role, content: m.content })),
      mode,
      ai_style: aiStyle,
      kind,
    }),
    signal: controller.signal,
  })
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      reader = res.body!.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''

      function processBuffer() {
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''

        for (const event of events) {
          const lines = event.split('\n')
          for (const line of lines) {
            if (!line.startsWith('data:')) continue
            const data = line.slice(5).trim()
            if (!data) continue
            if (data === '[DONE]') {
              clearTimeout(timeout)
              onDone()
              return
            }
            try {
              const json = JSON.parse(data)
              if (json.text) onChunk(json.text)
              if (json.msg_ids) onMsgIds?.(json.msg_ids.user, json.msg_ids.ai)
              if (json.error) onError(json.error)
            } catch (e) {
              console.warn('[SSE] JSON 解析失败，分片数据:', data.slice(0, 80), e)
            }
          }
        }
      }

      function read() {
        reader!.read().then(({ done, value }) => {
          if (done) {
            if (buffer.trim()) processBuffer()
            clearTimeout(timeout)
            onDone()
            return
          }
          buffer += decoder.decode(value, { stream: true })
          processBuffer()
          read()
        }).catch(err => {
          clearTimeout(timeout)
          if (err?.name !== 'AbortError') onError(err)
        })
      }

      read()
    })
    .catch(err => {
      clearTimeout(timeout)
      if (err?.name !== 'AbortError') onError(err)
    })
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

export async function getSuggestions(mode: 'socratic' | 'normal') {
  const res = await api.get(`/api/chat/suggestions?mode=${mode}`)
  return res.data.suggestions as string[]
}
