import { watch, nextTick } from 'vue'
import {
  now,
  retryableAiIndex,
  replyUserIndex,
  extractTopic,
  isNewTopicIntent,
} from '../../utils/chat'
import type { DialogueState } from './useDialogueState'
import type { useDialogueStreaming } from './useDialogueStreaming'
import type { useDialogueAgent } from './useDialogueAgent'

type Context = Pick<
  DialogueState,
  | 'blockDuringAssessment'
  | 'isGenerating'
  | 'isThinking'
  | 'currentSession'
  | 'input'
  | 'chatMode'
  | 'assessmentActive'
  | 'assessmentCanAnswer'
  | 'attachmentsEnabled'
  | 'attachmentDrafts'
  | 'agentStore'
  | 'chatError'
  | 'attachmentDisabledReason'
  | 'store'
  | 'activeAgentRun'
  | 'inputBarRef'
  | 'pushMessage'
  | 'resetScrollToBottom'
  | 'scrollToBottom'
  | 'quotedText'
  | 'quotedSource'
  | 'clearQuote'
  | 'handlePendingTopicChoice'
  | 'sessionTitles'
  | 'currentTopicId'
  | 'inheritCurrentTopicAvatar'
  | 'aiStyle'
  | 'retryUserIndex'
  | 'retryRequest'
> &
  Pick<ReturnType<typeof useDialogueStreaming>, 'abortChat' | 'streamDialogue'> &
  Pick<
    ReturnType<typeof useDialogueAgent>,
    'recordCurrentAgentStep' | 'assessmentFlow' | 'onboardingFlow'
  >

export function useDialogueSend(context: Context) {
  const {
    blockDuringAssessment,
    isGenerating,
    isThinking,
    currentSession,
    input,
    chatMode,
    assessmentActive,
    assessmentCanAnswer,
    attachmentsEnabled,
    attachmentDrafts,
    agentStore,
    chatError,
    attachmentDisabledReason,
    store,
    activeAgentRun,
    inputBarRef,
    pushMessage,
    resetScrollToBottom,
    scrollToBottom,
    quotedText,
    quotedSource,
    clearQuote,
    handlePendingTopicChoice,
    sessionTitles,
    currentTopicId,
    inheritCurrentTopicAvatar,
    aiStyle,
    retryUserIndex,
    retryRequest,
    abortChat,
    streamDialogue,
    recordCurrentAgentStep,
    assessmentFlow,
    onboardingFlow,
  } = context

  function buildUserInput(v: string, quote?: string): string {
    return quote ? `> ${quote}\n\n${v}` : v
  }

  function sendChoiceText(choiceText: string) {
    if (blockDuringAssessment()) return
    if (isGenerating.value) return
    if (isThinking.value) abortChat()

    const msgs = currentSession.value?.messages
    if (msgs) {
      const matchLabel = choiceText.match(/^([A-F])[.、]/)
      if (matchLabel) {
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === 'ai' && msgs[i].choices?.length) {
            msgs[i].selected_choice = matchLabel[1]
            break
          }
        }
      }
    }

    input.value = choiceText
    send()
  }

  function sendSuggestion(text: string) {
    if (blockDuringAssessment()) return
    input.value = text
    void send({
      topicFollowUp: chatMode.value === 'socratic' && Boolean(currentSession.value?.topicId),
    })
  }

  async function send(options?: { topicFollowUp?: boolean }) {
    if (assessmentActive.value && !assessmentCanAnswer.value) {
      blockDuringAssessment()
      return
    }
    const v = input.value.trim()
    const newTopicIntent = !options?.topicFollowUp && isNewTopicIntent(v)
    if (
      (!v && (!attachmentsEnabled.value || !attachmentDrafts.drafts.value.length)) ||
      isThinking.value ||
      isGenerating.value ||
      agentStore.submitting ||
      agentStore.run?.processing ||
      (chatMode.value === 'socratic' && agentStore.run?.status === 'awaiting_confirmation')
    )
      return

    if (
      attachmentsEnabled.value &&
      attachmentDrafts.drafts.value.length &&
      !attachmentDrafts.ready.value
    ) {
      chatError.value =
        attachmentDisabledReason.value || '请先等待所有附件处理完成，或移除失败附件。'
      return
    }
    if (
      attachmentsEnabled.value &&
      attachmentDrafts.drafts.value.length &&
      chatMode.value === 'socratic' &&
      newTopicIntent
    ) {
      chatError.value = '附件仅用于当前节点问答。新主题创建暂不支持附件，草稿已保留。'
      return
    }

    if (chatMode.value === 'socratic') {
      store.recordLearning()
    }

    if (chatMode.value === 'socratic' && agentStore.run?.step && activeAgentRun.value) {
      const runId = agentStore.run.run_id
      const stepId = agentStore.run.step.step_id
      inputBarRef.value?.reset()
      recordCurrentAgentStep()
      pushMessage({
        role: 'user',
        text: v,
        time: now(),
        messageType: 'agent_answer',
        metadata: { run_id: runId, step_id: stepId },
      })
      input.value = ''
      resetScrollToBottom()
      await (agentStore.run.type === 'assessment'
        ? assessmentFlow.answer(v)
        : onboardingFlow.answer(v))
      scrollToBottom()
      return
    }

    inputBarRef.value?.reset()
    const attachmentsSnapshot = attachmentsEnabled.value ? attachmentDrafts.snapshot() : []
    const attachmentIds = attachmentsSnapshot.map((attachment) => attachment.id)
    const attachmentScopeKey = attachmentDrafts.key.value
    const quoteSnapshot = quotedText.value
    const sourceSnapshot = quotedSource.value
    const userInput = buildUserInput(v, quoteSnapshot)
    clearQuote()

    pushMessage({
      role: 'user',
      text: v,
      quote: quoteSnapshot || undefined,
      quote_source_db_id: sourceSnapshot?.dbId,
      quote_source_local_id: sourceSnapshot?.localId,
      time: now(),
      messageType: 'chat',
      attachments: attachmentsSnapshot,
    })
    input.value = ''
    resetScrollToBottom()

    if (chatMode.value === 'normal') {
      void streamDialogue({
        nodeKey: 'normal',
        topicId: 0,
        input: userInput,
        mode: 'normal',
        style: '标准',
        attachmentIds,
        attachmentScopeKey,
        userMessage: currentSession.value!.messages.at(-1),
        quote: quoteSnapshot ? { text: quoteSnapshot, sourceId: sourceSnapshot?.dbId } : undefined,
      })
      return
    }

    if (currentSession.value?.awaitingTopicChoice) {
      const handled = await handlePendingTopicChoice(v)
      if (currentSession.value) void sessionTitles.ensureTitle(currentSession.value)
      if (handled) {
        scrollToBottom()
        return
      }
    }

    if (currentSession.value?.topicId && newTopicIntent) {
      pushMessage({
        role: 'ai',
        text: `本对话已绑定「**${currentSession.value.topicTitle}**」主题，每个学习对话只能学习一个主题。\n\n如需学习新主题，请点击右上角「＋」新建对话。`,
        time: now(),
      })
      scrollToBottom()
      return
    }

    if (newTopicIntent) {
      const topicName = extractTopic(v)
      if (topicName.length >= 2) {
        agentStore.openOnboarding(topicName)
        scrollToBottom()
        return
      }
    }

    if (currentSession.value?.topicId == null && store.activeNode) {
      const topicId = currentTopicId.value
      const topic = store.topics.find((t) => Number(t.id) === topicId)
      if (topicId && topic) {
        inheritCurrentTopicAvatar(currentSession.value, topicId)
        currentSession.value.topicId = topicId
        currentSession.value.topicTitle = topic.title
      }
    }

    if (!store.activeNode) {
      const boundTitle = currentSession.value?.topicTitle
      const hint = boundTitle
        ? `这是「**${boundTitle}**」的专属对话。请在右侧图谱中点击一个节点，针对该主题的具体知识点来对话 👉`
        : '请先在右侧图谱中点击一个节点，我们针对具体知识点来对话 👉'
      pushMessage({ role: 'ai', text: hint, time: now() })
      scrollToBottom()
      return
    }

    if (currentSession.value?.topicId && !store.nodes.some((n) => n.id === store.activeNode!.id)) {
      pushMessage({
        role: 'ai',
        text: `当前对话绑定的是「**${currentSession.value.topicTitle}**」主题，请在该主题的图谱里选一个节点继续。`,
        time: now(),
      })
      scrollToBottom()
      return
    }

    void streamDialogue({
      nodeKey: store.activeNode.id,
      topicId: currentTopicId.value,
      input: userInput,
      mode: 'socratic',
      style: aiStyle.value,
      attachmentIds,
      attachmentScopeKey,
      userMessage: currentSession.value!.messages.at(-1),
      quote: quoteSnapshot ? { text: quoteSnapshot, sourceId: sourceSnapshot?.dbId } : undefined,
    })
  }

  async function retryAt(messageIndex: number) {
    if (blockDuringAssessment()) return
    if (isThinking.value) return
    if (messageIndex === retryUserIndex.value && retryRequest.value) {
      retryRequest.value()
      return
    }
    const messages = currentSession.value?.messages ?? []
    const aiIndex = retryableAiIndex(messages)
    if (aiIndex < 0) return
    const userIndex = replyUserIndex(messages, aiIndex)
    if (messageIndex !== aiIndex && messageIndex !== userIndex) return
    const original = messages[aiIndex]
    if (original.db_id == null) {
      chatError.value = '这条回复尚未保存，无法重新生成。'
      return
    }
    const request = original.chatRequest
    const userMessage = messages[userIndex]
    if (!userMessage && !request) return
    await streamDialogue({
      nodeKey:
        request?.nodeKey ?? (chatMode.value === 'normal' ? 'normal' : (store.activeNode?.id ?? '')),
      topicId: chatMode.value === 'normal' ? 0 : currentTopicId.value,
      input: request?.input ?? buildUserInput(userMessage!.text, userMessage!.quote),
      kind: request?.kind,
      mode: chatMode.value,
      style: aiStyle.value,
      userMessage,
      replaceMessage: original,
      regenerateMessageId: original.db_id,
      attachmentIds:
        request?.attachmentIds ?? userMessage?.attachments?.map((attachment) => attachment.id),
      quote: userMessage?.quote
        ? { text: userMessage.quote, sourceId: userMessage.quote_source_db_id }
        : undefined,
    })
  }

  function streamOverview(kind: 'topic' | 'node', identifier: string): Promise<void> {
    return streamDialogue({
      nodeKey: identifier,
      topicId: currentTopicId.value,
      input: '',
      mode: 'socratic',
      style: aiStyle.value,
      kind: kind === 'topic' ? 'topic_overview' : 'node_overview',
    })
  }

  // Let navigation reset the target session and recovery snapshot its request
  // before opening a new stream. Abandon a deferred request after disposal.
  watch(
    () => store.nodeDialogueRequest,
    async (_request, _previous, onCleanup) => {
      let stale = false
      onCleanup(() => {
        stale = true
      })
      if (blockDuringAssessment()) return
      const node = store.activeNode
      if (!node) return
      if (chatMode.value !== 'socratic') {
        chatMode.value = 'socratic'
      }
      await nextTick()
      if (stale || blockDuringAssessment()) return

      if (node.state === 'mastered') {
        await streamDialogue({
          nodeKey: node.id,
          topicId: currentTopicId.value,
          input: `用户想复习「${node.label}」（${node.sub}），请用苏格拉底式提问引导用户回顾这个知识点的核心内容。`,
          mode: 'socratic',
          style: aiStyle.value,
        })
        return
      }

      await streamOverview('node', node.id)
    },
    { flush: 'post' },
  )

  return { buildUserInput, sendChoiceText, sendSuggestion, send, retryAt, streamOverview }
}
