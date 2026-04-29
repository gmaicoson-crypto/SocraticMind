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
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: any) => void,
) {
  const token = localStorage.getItem('sm_token')

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
    }),
  })
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()

      function read() {
        reader.read().then(({ done, value }) => {
          if (done) { onDone(); return }
          const text = decoder.decode(value)
          // 解析 SSE 格式
          text.split('\n').forEach(line => {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim()
              if (data === '[DONE]') { onDone(); return }
              try {
                const json = JSON.parse(data)
                if (json.text) onChunk(json.text)
              } catch {}
            }
          })
          read()
        })
      }
      read()
    })
    .catch(onError)
}

// 获取对话历史
export async function getChatHistory(nodeKey: string) {
  const res = await api.get(`/api/chat/history/${nodeKey}`)
  return res.data as { id: number; role: string; content: string }[]
}