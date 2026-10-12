import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { getAllMessages, type StoredChatMessage } from '../../api/chat'
import { useDialogueHistory } from '../useDialogueHistory'
import { createDefaultSession } from '../useChatSessions'
import { retryableAiIndex } from '../../utils/chat'
import { attachment } from '../../test/fixtures/attachments'
import { webSnapshot } from '../../test/fixtures/webSearch'

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
  const normalSessions = ref([createDefaultSession('normal')])
  const history = useDialogueHistory({
    socraticSessions: sessions,
    normalSessions,
    topics: () => [],
    createDefaultSession,
    saveSessions: vi.fn(),
    parseChoices: (text) => ({ cleanText: text, choices: null }),
    inferSelectedChoices: vi.fn(),
  })
  return { sessions, normalSessions, history }
}

describe('restoring message order', () => {
  it.each(['socratic', 'normal'] as const)(
    'keeps the user before an AI reply with the same timestamp in %s mode',
    async (mode) => {
      const { sessions, normalSessions, history } = createHistory()
      const modeSessions = mode === 'socratic' ? sessions : normalSessions
      modeSessions.value[0].id = 'same-time-session'
      modeSessions.value[0].messages = [
        { role: 'user', text: '待同步的提问', time: '2026-01-01T00:00:01Z' },
      ]
      vi.mocked(getAllMessages).mockResolvedValue([
        stored({
          id: 22,
          role: 'ai',
          content: '回答',
          mode,
          session_id: 'same-time-session',
          metadata: { user_message_id: 21 },
        }),
        stored({
          id: 21,
          role: 'user',
          content: '提问',
          mode,
          session_id: 'same-time-session',
        }),
      ])

      await history.rebuildFromBackend()

      expect(modeSessions.value[0].messages.map((message) => message.db_id ?? 'local')).toEqual([
        21,
        22,
        'local',
      ])
      expect(modeSessions.value[0].messages.map((message) => message.role)).toEqual([
        'user',
        'ai',
        'user',
      ])
    },
  )
})

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
    expect(sessions.value[0].nodeKey).toBe('original-node')
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
  it('restores attachment-only messages as visible user messages and freezes their original ids', async () => {
    const { sessions, history } = createHistory()
    vi.mocked(getAllMessages).mockResolvedValue([
      stored({ content: '', attachments: [attachment()] }),
      stored({
        id: 12,
        role: 'ai',
        content: '附件回答',
        metadata: { user_message_id: 10, kind: 'qa' },
      }),
    ])
    await history.rebuildFromBackend()
    const user = sessions.value[0]!.messages.find((message) => message.db_id === 10)
    expect(user).toMatchObject({ role: 'user', text: '', attachments: [{ id: 'attachment-1' }] })
    const answer = sessions.value[0]!.messages.find((message) => message.db_id === 12)
    expect(answer?.paired_db_id).toBeUndefined()
    expect(answer?.chatRequest).toMatchObject({
      kind: 'qa',
      attachmentIds: ['attachment-1'],
      userMessageId: 10,
    })
  })

  it('restores authoritative sources without creating a frontend search preference', async () => {
    const { sessions, history } = createHistory()
    const web = webSnapshot()
    vi.mocked(getAllMessages).mockResolvedValue([
      stored({}),
      stored({
        id: 12,
        role: 'ai',
        content: '结论 [[source:s1]]',
        metadata: { status: 'interrupted', user_message_id: 10, kind: 'qa', web },
      }),
    ])
    await history.rebuildFromBackend()
    expect(sessions.value[0]).not.toHaveProperty('webMode')
    expect(sessions.value[0].messages.find((message) => message.db_id === 12)).toMatchObject({
      metadata: { web },
    })
    expect(
      sessions.value[0].messages.find((message) => message.db_id === 12)?.chatRequest,
    ).not.toHaveProperty('webMode')
  })

  it('clears the previous node binding when the latest saved reply is a topic overview', async () => {
    const { sessions, history } = createHistory()
    sessions.value[0].nodeKey = 'old-node'
    vi.mocked(getAllMessages).mockResolvedValue([
      stored({ id: 20, node_key: 'AI基础', content: '' }),
      stored({
        id: 21,
        role: 'ai',
        node_key: 'AI基础',
        content: '主题介绍',
        metadata: { user_message_id: 20, kind: 'topic_overview' },
      }),
      stored({
        id: 12,
        role: 'ai',
        node_key: 'old-node',
        content: '旧节点回答',
        metadata: { user_message_id: 10 },
      }),
      stored({ id: 10, node_key: 'old-node' }),
    ])
    await history.rebuildFromBackend()
    expect(sessions.value[0].nodeKey).toBeNull()
  })
})
