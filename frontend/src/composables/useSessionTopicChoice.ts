import type { ComputedRef } from 'vue'
import type { DialogueSession, Message, Topic } from '../types'
import { isNewTopicIntent, now } from '../utils/chat'
import { randomAiAvatar } from '../utils/avatarPresets'
import { createWelcomeMessage } from './useChatSessions'

interface SessionTopicChoiceOptions {
  currentSession: ComputedRef<DialogueSession | undefined>
  topics: () => Topic[]
  pushMessage: (message: Message) => void
  saveSessions: () => void
  setActiveTopic: (id: string) => Promise<void>
  inheritTopicAvatar: (session: DialogueSession, topicId: number) => void
}

function clearTopicChoice(session: DialogueSession) {
  session.awaitingTopicChoice = false
  session.suggestedTopicId = undefined
  session.suggestedTopicTitle = undefined
}

export function useSessionTopicChoice(options: SessionTopicChoiceOptions) {
  const { currentSession, topics, pushMessage, saveSessions, setActiveTopic, inheritTopicAvatar } =
    options

  function prepareTopicChoice(session: DialogueSession, previous?: DialogueSession) {
    if (previous?.topicId == null) return
    inheritTopicAvatar(session, previous.topicId)
    const title =
      previous.topicTitle ??
      topics().find((topic) => Number(topic.id) === previous.topicId)?.title ??
      previous.name
    session.awaitingTopicChoice = true
    session.suggestedTopicId = previous.topicId
    session.suggestedTopicTitle = title
    session.messages = [
      {
        role: 'ai',
        text: `你刚才学习的是「**${title}**」。这个新对话要继续该主题，还是创建一个全新的学习主题呢？`,
        time: now(),
        choices: [
          { label: 'A', text: `继续「${title}」` },
          { label: 'B', text: '创建新的主题对话' },
        ],
      },
    ]
  }

  async function handlePendingTopicChoice(value: string): Promise<boolean> {
    const session = currentSession.value
    if (!session?.awaitingTopicChoice || session.suggestedTopicId == null) return false

    const continuePrevious = /^A[.、\s]/i.test(value) || /继续|刚才|上次|原主题/.test(value)
    const chooseNew = /^B[.、\s]/i.test(value) || isNewTopicIntent(value)

    if (continuePrevious) {
      const topic = topics().find((item) => Number(item.id) === session.suggestedTopicId)
      if (!topic) {
        clearTopicChoice(session)
        pushMessage({
          role: 'ai',
          text: '刚才的主题已不存在。请告诉我你想学习的新主题。',
          time: now(),
        })
        return true
      }

      inheritTopicAvatar(session, Number(topic.id))
      session.topicId = Number(topic.id)
      session.topicTitle = topic.title
      session.name = topic.title.slice(0, 12)
      clearTopicChoice(session)
      saveSessions()
      await setActiveTopic(topic.id)
      pushMessage({
        role: 'ai',
        text: `好的，这个对话将继续学习「**${topic.title}**」。请选择右侧知识图谱中的节点开始提问。`,
        time: now(),
      })
      return true
    }

    if (chooseNew) {
      const choseNewTopicOption =
        /^B[.、\s]/i.test(value) || /^(创建|重新创建)?新(的)?主题(对话)?$/.test(value.trim())
      const newTopicRequest = session.messages.at(-1)
      session.messages = [
        createWelcomeMessage('socratic'),
        ...(!choseNewTopicOption &&
        newTopicRequest?.role === 'user' &&
        newTopicRequest.text === value
          ? [newTopicRequest]
          : []),
      ]
      if (choseNewTopicOption) session.name = '新学习对话'
      if (!session.aiAvatarSelected) session.aiAvatarUrl = randomAiAvatar('socratic')
      clearTopicChoice(session)
      saveSessions()
      return choseNewTopicOption
    }

    pushMessage({
      role: 'ai',
      text: '请选择继续刚才的主题，或创建一个新主题。',
      time: now(),
      choices: [
        { label: 'A', text: `继续「${session.suggestedTopicTitle ?? '刚才的主题'}」` },
        { label: 'B', text: '创建新的主题对话' },
      ],
    })
    return true
  }

  return { prepareTopicChoice, handlePendingTopicChoice }
}
