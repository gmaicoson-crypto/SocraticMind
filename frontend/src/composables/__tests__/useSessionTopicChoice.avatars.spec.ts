import { computed, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useSessionTopicChoice } from '../useSessionTopicChoice'
import { createDefaultSession } from '../useChatSessions'
import { aiAvatarPresets } from '../../utils/avatarPresets'
import type { Topic } from '../../types'

describe('topic choice avatar inheritance', () => {
  const topic: Topic = { id: '1', title: '数学', nodes: 0, mastered: 0, emoji: '' }

  function setup() {
    const session = ref(createDefaultSession('socratic'))
    const inheritTopicAvatar = vi.fn((target) => {
      target.aiAvatarUrl = aiAvatarPresets[4]
    })
    const choice = useSessionTopicChoice({
      currentSession: computed(() => session.value),
      topics: () => [topic],
      pushMessage: vi.fn(),
      saveSessions: vi.fn(),
      setActiveTopic: vi.fn(async () => {}),
      inheritTopicAvatar,
    })
    choice.prepareTopicChoice(session.value, {
      ...createDefaultSession('socratic'),
      topicId: 1,
      topicTitle: topic.title,
    })
    return { session: session.value, choice, inheritTopicAvatar }
  }

  it('inherits when continuing the previous topic', async () => {
    const { session, choice, inheritTopicAvatar } = setup()
    expect(session.aiAvatarUrl).toBe(aiAvatarPresets[4])
    await choice.handlePendingTopicChoice('A. 继续')

    expect(inheritTopicAvatar).toHaveBeenCalledWith(session, 1)
    expect(session.topicId).toBe(1)
  })

  it('keeps the random avatar when starting a different topic', async () => {
    const { session, choice, inheritTopicAvatar } = setup()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    await choice.handlePendingTopicChoice('B. 创建新的主题对话')

    expect(inheritTopicAvatar).toHaveBeenCalledOnce()
    expect(session.aiAvatarUrl).toBe(aiAvatarPresets[0])
    expect(session.topicId).toBeUndefined()
    vi.restoreAllMocks()
  })

  it('preserves a manually selected avatar when starting a different topic', async () => {
    const { session, choice } = setup()
    session.aiAvatarUrl = aiAvatarPresets[2]
    session.aiAvatarSelected = true

    await choice.handlePendingTopicChoice('B. 创建新的主题对话')
    expect(session.aiAvatarUrl).toBe(aiAvatarPresets[2])
  })
})
