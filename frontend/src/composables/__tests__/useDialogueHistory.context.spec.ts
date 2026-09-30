import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { getAllMessages, type StoredChatMessage } from '../../api/chat'
import { useDialogueHistory } from '../useDialogueHistory'
import { createDefaultSession } from '../useChatSessions'
import { retryableAiIndex } from '../../utils/chat'

vi.mock('../../api/chat', () => ({ getAllMessages: vi.fn() }))

function stored(overrides: Partial<StoredChatMessage>): StoredChatMessage {
  return {
    id: 10,
    role: 'user',
    content: '原问题',
    node_key: 'original-node',
    mode: 'socratic',
    topic_id: 1,
    session_id: 'session',
    message_type: 'chat',
    metadata: null,
    created_at: '2026-01-01T00:00:01Z',
    ...overrides,
  }
}

function createHistory() {
  const existing = createDefaultSession('socratic')
  existing.id = 'session'
  existing.messages.push(
    { role: 'user', text: '原问题', time: '2026-01-01T00:00:01Z', db_id: 10 },
    { role: 'ai', text: '旧回答', time: '2026-01-01T00:00:02Z', db_id: 11 },
  )
  const sessions = ref([existing])
  const history = useDialogueHistory({
    socraticSessions: sessions,
    normalSessions: ref([createDefaultSession('normal')]),
    topics: () => [],
    createDefaultSession,
    saveSessions: vi.fn(),
    parseChoices: (text) => ({ cleanText: text, choices: null }),
    inferSelectedChoices: vi.fn(),
  })
  return { sessions, history }
}

describe('restoring server managed context', () => {
  it('replaces cached superseded replies and restores the original request for later regeneration', async () => {
    const { sessions, history } = createHistory()
    vi.mocked(getAllMessages).mockResolvedValue([
      stored({
        id: 12,
        role: 'ai',
        content: '重新生成的回答',
        metadata: { status: 'complete', user_message_id: 10, kind: 'qa' },
        created_at: '2026-01-01T00:00:03Z',
      }),
      stored({}),
    ])
    await history.rebuildFromBackend()
    const messages = sessions.value[0].messages
    expect(messages.some((message) => message.db_id === 11)).toBe(false)
    expect(messages.find((message) => message.db_id === 12)).toMatchObject({
      text: '重新生成的回答',
      chatRequest: { nodeKey: 'original-node', input: '原问题', kind: 'qa', userMessageId: 10 },
    })
    expect(messages.filter((message) => message.db_id === 10)).toHaveLength(1)
  })

  it('restores a hidden overview question so its answer can be regenerated and deleted as a pair', async () => {
    const { sessions, history } = createHistory()
    vi.mocked(getAllMessages).mockResolvedValue([
      stored({
        id: 12,
        role: 'ai',
        content: '节点概览',
        metadata: { status: 'complete', user_message_id: 10, kind: 'node_overview' },
        created_at: '2099-01-01T00:00:03Z',
      }),
      stored({ content: '' }),
    ])
    await history.rebuildFromBackend()
    const messages = sessions.value[0].messages
    expect(messages.some((message) => message.db_id === 10)).toBe(false)
    expect(messages.at(-1)).toMatchObject({
      text: '节点概览',
      paired_db_id: 10,
      chatRequest: {
        input: '',
        nodeKey: 'original-node',
        kind: 'node_overview',
        userMessageId: 10,
      },
    })
    expect(retryableAiIndex(messages)).toBe(messages.length - 1)
  })
})
