import { computed } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAllMessages, type StoredChatMessage } from '../../api/chat'
import type { ChatMode, DialogueSession, Message } from '../../types'
import { retryableAiIndex } from '../../utils/chat'
import { createDefaultSession, useChatSessions } from '../useChatSessions'
import { useDialogueHistory } from '../useDialogueHistory'
import { useSessionTopicChoice } from '../useSessionTopicChoice'

vi.mock('../../api/chat', () => ({ getAllMessages: vi.fn() }))

function storedMessages(mode: ChatMode, sessionId: string): StoredChatMessage[] {
  return [
    {
      id: 12,
      role: 'ai',
      content: '历史回答',
      node_key: '',
      mode,
      topic_id: mode === 'socratic' ? 1 : null,
      session_id: sessionId,
      message_type: 'chat',
      metadata: { user_message_id: 11 },
      created_at: '2026-01-01T00:00:02Z',
    },
    {
      id: 11,
      role: 'user',
      content: '历史问题',
      node_key: '',
      mode,
      topic_id: mode === 'socratic' ? 1 : null,
      session_id: sessionId,
      message_type: 'chat',
      metadata: null,
      created_at: '2026-01-01T00:00:01Z',
    },
  ]
}

function setup() {
  const sessions = useChatSessions()
  const history = useDialogueHistory({
    ...sessions,
    topics: () => [{ id: '1', title: 'RAG', emoji: '', nodes: 0, mastered: 0 }],
    parseChoices: (text) => ({ cleanText: text, choices: null }),
    inferSelectedChoices: vi.fn(),
  })
  return { ...sessions, history }
}

describe('conversation openings across refreshes', () => {
  beforeEach(() => localStorage.clear())

  it.each(['socratic', 'normal'] as const)(
    'keeps the original %s opening first through repeated server restores and reloads',
    async (mode) => {
      const sessions = setup()
      const modeSessions = mode === 'socratic' ? sessions.socraticSessions : sessions.normalSessions
      const session = modeSessions.value[0]
      const opening = { ...session.messages[0], time: '23:59', metadata: undefined }
      session.messages = [opening]
      vi.mocked(getAllMessages).mockResolvedValue(storedMessages(mode, session.id))

      await sessions.history.rebuildFromBackend()
      await sessions.history.rebuildFromBackend()
      sessions.disposeSessionPersistence()

      const reloaded = setup()
      await reloaded.history.rebuildFromBackend()
      const restored = (
        mode === 'socratic' ? reloaded.socraticSessions : reloaded.normalSessions
      ).value.find((item) => item.id === session.id)!
      expect(restored.messages.map((message) => message.text)).toEqual([
        opening.text,
        '历史问题',
        '历史回答',
      ])
      expect(restored.messages[0].time).toBe(opening.time)
      expect(retryableAiIndex(restored.messages)).toBe(2)
      expect(restored.updatedAt).toBe('2026-01-01T00:00:02Z')
      reloaded.disposeSessionPersistence()
    },
  )

  it('creates a topic opening once and keeps it first after restoring older replies', async () => {
    const sessions = setup()
    const session = sessions.history.findOrCreateTopicSession(1)
    const opening = { ...session.messages[0], metadata: undefined }
    // The opening can be newer than server replies when an older cache is recovered.
    opening.time = '2099-01-01T00:00:00Z'
    session.messages = [opening]
    vi.mocked(getAllMessages).mockResolvedValue(storedMessages('socratic', session.id))

    await sessions.history.rebuildFromBackend()
    await sessions.history.rebuildFromBackend()
    const existing = sessions.history.findOrCreateTopicSession(1)
    expect(existing.id).toBe(session.id)
    expect(existing.messages.map((message) => message.text)).toEqual([
      opening.text,
      '历史问题',
      '历史回答',
    ])
    sessions.disposeSessionPersistence()
  })

  it('keeps the topic-choice opening before a saved continuation question', async () => {
    const sessions = setup()
    const session = sessions.socraticSessions.value[0]
    const choice = useSessionTopicChoice({
      currentSession: computed(() => sessions.socraticSessions.value[0]),
      topics: () => [],
      pushMessage: vi.fn(),
      saveSessions: sessions.saveSessions,
      setActiveTopic: vi.fn(),
      inheritTopicAvatar: vi.fn(),
    })
    choice.prepareTopicChoice(session, {
      ...createDefaultSession('socratic'),
      topicId: 1,
      topicTitle: 'RAG',
    })
    const opening = { ...session.messages[0], metadata: undefined, time: '23:59' }
    session.messages = [opening]
    vi.mocked(getAllMessages).mockResolvedValue(storedMessages('socratic', session.id))

    await sessions.history.rebuildFromBackend()
    expect(sessions.socraticSessions.value[0].messages[0]).toEqual(opening)
    expect(sessions.socraticSessions.value[0].messages).toHaveLength(3)
    sessions.disposeSessionPersistence()
  })

  it.each(['socratic', 'normal'] as const)(
    'repairs a legacy %s cache with duplicated trailing openings before displaying it',
    (mode) => {
      const session = createDefaultSession(mode)
      const opening = { ...session.messages[0], metadata: undefined, time: '23:59' }
      const reply: Message = {
        role: 'ai',
        text: '历史回答',
        time: '2026-01-01T00:00:02Z',
        db_id: 12,
      }
      session.messages = [reply, opening, { ...opening, time: '23:58' }]
      localStorage.setItem(`sm_${mode}_sessions`, JSON.stringify([session]))

      const sessions = setup()
      const restored = (mode === 'socratic' ? sessions.socraticSessions : sessions.normalSessions)
        .value[0]
      expect(restored.messages).toEqual([opening, reply])
      const cached = JSON.parse(localStorage.getItem(`sm_${mode}_sessions`)!) as DialogueSession[]
      expect(cached[0].messages).toEqual([opening, reply])
      sessions.disposeSessionPersistence()
    },
  )

  it.each(['socratic', 'normal'] as const)(
    'does not add an opening to a %s conversation restored without a cache',
    async (mode) => {
      const sessions = setup()
      vi.mocked(getAllMessages).mockResolvedValue(storedMessages(mode, 'server-only'))
      await sessions.history.rebuildFromBackend()
      await sessions.history.rebuildFromBackend()

      const restored = (
        mode === 'socratic' ? sessions.socraticSessions : sessions.normalSessions
      ).value.find((session) => session.id === 'server-only')!
      expect(restored.messages.map((message) => message.text)).toEqual(['历史问题', '历史回答'])
      sessions.disposeSessionPersistence()
    },
  )

  it('does not treat a saved answer quoting the opening as a new opening', async () => {
    const sessions = setup()
    const session = sessions.normalSessions.value[0]
    const messages = storedMessages('normal', session.id)
    messages[0].content = session.messages[0].text
    vi.mocked(getAllMessages).mockResolvedValue(messages)

    await sessions.history.rebuildFromBackend()
    expect(sessions.normalSessions.value[0].messages.map((message) => message.db_id)).toEqual([
      undefined,
      11,
      12,
    ])
    sessions.disposeSessionPersistence()
  })
})
