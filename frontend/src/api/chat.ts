import api from './index'

export interface ChatMessage {
  role: 'ai' | 'user'
  content: string
}

// SSE 流式对话
export function chatStream(
  nodeKey: string,
  topicId: number,
  userInput: string,
  history: ChatMessage[],
  mode: 'socratic' | 'normal',
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: any) => void,
  controllers?: AbortController,
  onSignal?: (signal: string) => void,
) {
  const token = localStorage.getItem('sm_token')

  // 使用外部传入的 controller，没有则新建
  const controller = controllers ?? new AbortController()

  // 5分钟超时
  const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000)

  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null

  // 中断时同时取消 reader
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
      user_input: userInput,
      history: history.map(m => ({ role: m.role, content: m.content })),
      mode,
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
              if (json.signal) onSignal?.(json.signal)
            } catch {}
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
          // AbortError 不触发 onError
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

// 获取对话历史
export async function getChatHistory(nodeKey: string) {
  const res = await api.get(`/api/chat/history/${nodeKey}`)
  return res.data as { id: number; role: string; content: string }[]
}