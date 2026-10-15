import { hasMessageContent, countCompletedChatTurns } from '../../utils/chat'
import { useDialogueSuggestions } from '../useDialogueSuggestions'
import type { DialogueState } from './useDialogueState'

type Context = Pick<
  DialogueState,
  | 'currentSession'
  | 'chatMode'
  | 'currentTopicId'
  | 'store'
  | 'modelsStore'
  | 'isThinking'
  | 'isGenerating'
  | 'activeAgentRun'
  | 'draftTopic'
>

export function useCurrentDialogueSuggestions(context: Context) {
  const {
    currentSession,
    chatMode,
    currentTopicId,
    store,
    modelsStore,
    isThinking,
    isGenerating,
    activeAgentRun,
    draftTopic,
  } = context

  const { chips, chipsLoading, refreshSuggestions } = useDialogueSuggestions(
    () => {
      const session = currentSession.value
      const topicId = chatMode.value === 'socratic' ? session?.topicId : undefined
      const hasConversation =
        chatMode.value === 'normal' &&
        Boolean(
          session?.messages.some(
            (message) =>
              (!message.messageType || message.messageType === 'chat') &&
              hasMessageContent(message) &&
              (message.role === 'user' || message.db_id != null || message.chatRequest),
          ),
        )
      const node =
        topicId &&
        currentTopicId.value === topicId &&
        store.nodes.some((item) => item.id === store.activeNode?.id)
          ? store.activeNode
          : null
      return {
        mode: chatMode.value,
        userId: store.userInfo?.id,
        modelId: modelsStore.selectedModelId,
        ...(topicId || hasConversation
          ? {
              sessionId: session?.id,
              completedTurns: countCompletedChatTurns(session?.messages ?? []),
            }
          : {}),
        ...(chatMode.value === 'normal' ? { hasConversation } : {}),
        ...(topicId
          ? {
              topicId,
              topicTitle:
                store.topics.find((topic) => Number(topic.id) === topicId)?.title ??
                session?.topicTitle,
              nodeKey: node?.id,
              nodeLabel: node?.label,
              nodeSub: node?.sub,
            }
          : {}),
      }
    },
    () => !isThinking.value && !isGenerating.value && !activeAgentRun.value && !draftTopic.value,
  )

  return { chips, chipsLoading, refreshSuggestions }
}
