import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultSession, useChatSessions } from '../useChatSessions'
import { normalAiAvatarPresets, studyAiAvatarPresets } from '../../utils/avatarPresets'

describe('conversation AI avatars', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('randomly assigns one of six portraits to each new conversation', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)

    expect(createDefaultSession('socratic').aiAvatarUrl).toBe(studyAiAvatarPresets[0])
    random.mockReturnValue(0.99)
    expect(createDefaultSession('normal').aiAvatarUrl).toBe(normalAiAvatarPresets[5])
  })

  it('persists a distinct portrait for each conversation', () => {
    const sessions = useChatSessions()
    const first = sessions.socraticSessions.value[0]
    const second = createDefaultSession('socratic')
    first.aiAvatarUrl = studyAiAvatarPresets[1]
    second.aiAvatarUrl = studyAiAvatarPresets[4]
    sessions.socraticSessions.value.push(second)
    sessions.saveSessions(true)

    const restored = useChatSessions()
    expect(restored.socraticSessions.value.map((session) => session.aiAvatarUrl)).toEqual([
      studyAiAvatarPresets[1],
      studyAiAvatarPresets[4],
    ])
  })

  it('maps old study URLs and replaces old random normal-session portraits', () => {
    localStorage.setItem(
      'sm_socratic_sessions',
      JSON.stringify([
        {
          ...createDefaultSession('socratic'),
          aiAvatarUrl: '/avatars/AI/AI-female-2.webp',
          aiAvatarSelected: true,
        },
      ]),
    )
    localStorage.setItem(
      'sm_normal_sessions',
      JSON.stringify([
        { ...createDefaultSession('normal'), aiAvatarUrl: '/avatars/AI/AI-male-1.webp' },
        {
          ...createDefaultSession('normal'),
          aiAvatarUrl: '/avatars/AI/AI_normal_3.webp',
          aiAvatarSelected: true,
        },
      ]),
    )
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const sessions = useChatSessions()
    expect(sessions.socraticSessions.value[0].aiAvatarUrl).toBe(studyAiAvatarPresets[1])
    expect(sessions.normalSessions.value[0].aiAvatarUrl).toBe(normalAiAvatarPresets[0])
    expect(sessions.normalSessions.value[1].aiAvatarUrl).toBe(normalAiAvatarPresets[2])
    expect(JSON.parse(localStorage.getItem('sm_normal_sessions') ?? '[]')[0].aiAvatarUrl).toBe(
      normalAiAvatarPresets[0],
    )
  })
})
