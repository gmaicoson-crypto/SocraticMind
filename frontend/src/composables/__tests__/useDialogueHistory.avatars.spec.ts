import { ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAllMessages } from '../../api/chat'
import { useDialogueHistory } from '../useDialogueHistory'
import { createDefaultSession } from '../useChatSessions'
import { aiAvatarPresets } from '../../utils/avatarPresets'
import type { DialogueSession } from '../../types'

vi.mock('../../api/chat', () => ({ getAllMessages: vi.fn() }))

describe('dialogue history avatars', () => {
  afterEach(() => vi.useRealTimers())

  it('keeps a newly created conversation current when an older one has the same minute', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 29, 10, 15, 55))
    const newer: DialogueSession = {
      ...createDefaultSession('socratic'),
      topicId: 1,
      updatedAt: '09/29 10:15',
    }
    const older: DialogueSession = {
      ...createDefaultSession('socratic'),
      id: 's_1760000000000_old',
      topicId: 1,
      updatedAt: new Date(2026, 8, 29, 10, 15, 50).toISOString(),
      messages: [{ role: 'ai', text: '旧回答', time: '10:15', db_id: 42 }],
    }
    const history = useDialogueHistory({
      socraticSessions: ref([newer, older]),
      normalSessions: ref([createDefaultSession('normal')]),
      topics: () => [],
      createDefaultSession,
      saveSessions: vi.fn(),
      parseChoices: (text) => ({ cleanText: text, choices: null }),
      inferSelectedChoices: vi.fn(),
    })

    expect(history.findOrCreateTopicSession(1).id).toBe(newer.id)
  })

  it('inherits the latest avatar for the same topic unless the new conversation chose one', () => {
    const earlier: DialogueSession = {
      ...createDefaultSession('socratic'),
      id: 'earlier',
      topicId: 1,
      updatedAt: '09/27 10:00',
      aiAvatarUrl: aiAvatarPresets[0],
    }
    const latest: DialogueSession = {
      ...createDefaultSession('socratic'),
      id: 'latest',
      topicId: 1,
      updatedAt: '09/28 10:00',
      aiAvatarUrl: '/static/avatars/custom.webp',
    }
    const otherTopic: DialogueSession = {
      ...createDefaultSession('socratic'),
      id: 'other-topic',
      topicId: 2,
      updatedAt: '2026-09-29T10:00:00Z',
      aiAvatarUrl: aiAvatarPresets[5],
    }
    const newSession = createDefaultSession('socratic')
    const socraticSessions = ref([earlier, latest, otherTopic, newSession])
    const history = useDialogueHistory({
      socraticSessions,
      normalSessions: ref([createDefaultSession('normal')]),
      topics: () => [],
      createDefaultSession,
      saveSessions: vi.fn(),
      parseChoices: (text) => ({ cleanText: text, choices: null }),
      inferSelectedChoices: vi.fn(),
    })

    history.inheritTopicAvatar(newSession, 1, aiAvatarPresets[3])
    expect(newSession.aiAvatarUrl).toBe(latest.aiAvatarUrl)

    newSession.aiAvatarUrl = aiAvatarPresets[2]
    newSession.aiAvatarSelected = true
    history.inheritTopicAvatar(newSession, 1, aiAvatarPresets[3])
    expect(newSession.aiAvatarUrl).toBe(aiAvatarPresets[2])
  })

  it('retains the session portrait when messages are rebuilt from the server', async () => {
    const customAvatar = '/static/avatars/ai_1_custom.webp'
    const existing: DialogueSession = {
      ...createDefaultSession('socratic'),
      id: 'session-a',
      aiAvatarUrl: customAvatar,
      aiAvatarSelected: true,
    }
    const socraticSessions = ref([existing])
    const normalSessions = ref([createDefaultSession('normal')])
    vi.mocked(getAllMessages).mockResolvedValue([
      {
        id: 1,
        role: 'ai',
        content: '回答',
        node_key: '',
        mode: 'socratic',
        topic_id: null,
        session_id: 'session-a',
        message_type: 'chat',
        metadata: null,
        created_at: '2026-09-29T10:00:00Z',
      },
    ])

    const history = useDialogueHistory({
      socraticSessions,
      normalSessions,
      topics: () => [],
      createDefaultSession,
      saveSessions: vi.fn(),
      parseChoices: (text) => ({ cleanText: text, choices: null }),
      inferSelectedChoices: vi.fn(),
    })
    await history.rebuildFromBackend()

    expect(socraticSessions.value[0].aiAvatarUrl).toBe(customAvatar)
    expect(socraticSessions.value[0].aiAvatarSelected).toBe(true)
  })
})
