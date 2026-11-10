import { type Ref, ref, shallowRef, watch, computed } from 'vue'
import { useAttachmentDrafts } from '../useAttachmentDrafts'
import { useModelsStore } from '../../stores/models'
import { useLearningStore } from '../../stores/learning'
import { useAgentStore } from '../../stores/agent'
import { usePlansStore } from '../../stores/plans'
import type { ChatMode, DialogueSession as Session, Message } from '../../types'
import type { AssessmentResult as AssessmentResultData } from '../../types/learningAgent'
import { nowDate, sessionNodeKey } from '../../utils/chat'
import type { WebSnapshot } from '../../types/webSearch'
import { defaultAiAvatar, defaultNormalAiAvatar } from '../../utils/avatarPresets'
import { useChatSessions } from '../useChatSessions'
import { useSessionTitles } from '../useSessionTitles'
import { useChatStream } from '../useChatStream'
import { useTopicDialogue } from '../useTopicDialogue'
import { useDialogueHistory } from '../useDialogueHistory'
import { useSessionTopicChoice } from '../useSessionTopicChoice'
import type { StreamContext } from './types'
import type DialogueHistoryPanel from '../../components/dialogue/DialogueHistoryPanel.vue'
import type MessageList from '../../components/dialogue/MessageList.vue'
import type DialogueInputBar from '../../components/dialogue/DialogueInputBar.vue'

export function useDialogueState(view: {
  messageListRef: Readonly<Ref<InstanceType<typeof MessageList> | null>>
  inputBarRef: Readonly<Ref<InstanceType<typeof DialogueInputBar> | null>>
  historyPanelRef: Readonly<Ref<InstanceType<typeof DialogueHistoryPanel> | null>>
  sessionNameInputRef: Readonly<Ref<HTMLInputElement | null>>
  sessionNameButtonRef: Readonly<Ref<{ focus: () => void } | null>>
}) {
  const store = useLearningStore()

  const agentStore = useAgentStore()

  const plansStore = usePlansStore()

  const streamControl = useChatStream()

  const { parseChoices, inferSelectedChoices } = useTopicDialogue()

  const {
    socraticSessions,
    normalSessions,
    socraticCurrentId,
    normalCurrentId,
    chatMode,
    createDefaultSession,
    saveSessions,
    disposeSessionPersistence,
  } = useChatSessions()

  const sessionTitles = useSessionTitles({
    sessions: () => [...socraticSessions.value, ...normalSessions.value],
    mode: (session) =>
      socraticSessions.value.some((item) => item.id === session.id) ? 'socratic' : 'normal',
    userId: () => store.userInfo?.id,
  })

  const { messageListRef } = view

  const { inputBarRef } = view

  const streamEpoch = ref(0)

  const activeStreamMessageIds = ref<{ user: number; ai: number } | null>(null)

  const activeReplacementMessage = ref<Message | null>(null)

  const activeStreamUserMessage = shallowRef<Message | null>(null)

  const activeStream = shallowRef<StreamContext | null>(null)

  const chatError = ref('')

  const retryRequest = ref<(() => void) | null>(null)

  const retryUserMessage = ref<Message | null>(null)

  const input = ref('')

  const isThinking = ref(false)

  const isGenerating = ref(false)

  const streamingText = ref('')

  const streamingWeb = ref<WebSnapshot>()

  const streamingChoices = ref<{ label: string; text: string }[] | null>(null)

  const quotedText = ref('')

  const quotedSource = ref<{ dbId?: number; localId?: string } | null>(null)

  const showHistory = ref(false)

  const { historyPanelRef } = view

  const avatarPickerSessionId = ref<string | null>(null)

  const avatarPickerBusy = ref(false)

  const avatarPickerError = ref('')

  const editingSessionId = ref<string | null>(null)

  const editingName = ref('')

  const editingSessionInHeader = ref(false)

  const savingSessionName = ref(false)

  const sessionNameError = ref('')

  const { sessionNameInputRef } = view

  const { sessionNameButtonRef } = view

  const pendingSessionDelete = ref<{ id: string; name: string; mode: ChatMode } | null>(null)

  const deletingSession = ref(false)

  const sessionDeleteError = ref('')

  const masteryConfirm = ref<'self_report' | 'revert' | null>(null)

  const assessmentResult = shallowRef<AssessmentResultData | null>(null)

  const assessmentHistoryOpen = ref(false)

  const startingAssessment = ref(false)

  const currentTopicId = computed(() => Number(store.activeTopicId) || 0)

  const aiStyleOptions = ['温和', '标准', '严格'] as const

  const aiStyle = ref<string>(store.userInfo?.ai_style ?? '标准')

  const currentSessionId = computed(() =>
    chatMode.value === 'socratic' ? socraticCurrentId.value : normalCurrentId.value,
  )

  const currentSessions = computed(() =>
    chatMode.value === 'socratic' ? socraticSessions.value : normalSessions.value,
  )

  const currentSocraticSession = computed(
    () =>
      socraticSessions.value.find((s) => s.id === socraticCurrentId.value) ??
      socraticSessions.value[0],
  )

  const currentNormalSession = computed(
    () =>
      normalSessions.value.find((s) => s.id === normalCurrentId.value) ?? normalSessions.value[0],
  )

  const currentSession = computed(() =>
    chatMode.value === 'socratic' ? currentSocraticSession.value : currentNormalSession.value,
  )

  const aiAvatarUrl = computed(
    () =>
      currentSession.value?.aiAvatarUrl ??
      (chatMode.value === 'normal' ? defaultNormalAiAvatar : defaultAiAvatar),
  )

  const pickerSession = computed(() =>
    [...socraticSessions.value, ...normalSessions.value].find(
      (session) => session.id === avatarPickerSessionId.value,
    ),
  )

  const pickerAvatarUrl = computed(
    () =>
      pickerSession.value?.aiAvatarUrl ??
      (chatMode.value === 'normal' ? defaultNormalAiAvatar : defaultAiAvatar),
  )

  const currentSessionName = computed(() => currentSession.value?.name ?? '新对话')

  const canRenameCurrentSession = computed(
    () =>
      !currentSession.value?.awaitingTopicChoice &&
      currentSession.value?.messages.some((message) => message.role === 'user'),
  )

  const activeAgentRun = computed(() =>
    Boolean(agentStore.run && !['completed', 'cancelled'].includes(agentStore.run.status)),
  )

  const assessmentActive = computed(
    () =>
      startingAssessment.value || (agentStore.run?.type === 'assessment' && activeAgentRun.value),
  )

  const assessmentCanAnswer = computed(
    () => agentStore.run?.status === 'assessing' && Boolean(agentStore.run.step),
  )

  watch(assessmentActive, (active) => {
    if (active) {
      showHistory.value = false
      clearQuote()
    }
  })

  const draftTopic = computed(
    () => agentStore.onboardingTopic ?? agentStore.topicPlanDraft?.title ?? null,
  )

  const currentSessionNode = computed(() => {
    if (
      chatMode.value !== 'socratic' ||
      draftTopic.value ||
      activeAgentRun.value ||
      currentSession.value?.topicId !== currentTopicId.value
    )
      return undefined
    const nodeKey = sessionNodeKey(currentSession.value)
    return store.nodes.find((node) => node.id === nodeKey)
  })

  const currentSessionTitle = computed(
    () => currentSessionNode.value?.label ?? currentSessionName.value,
  )

  const dialogueStatus = computed(() => (isThinking.value ? '正在思考…' : '通过提问引导你发现答案'))

  const currentSessionSubtitle = computed(() =>
    currentSessionNode.value ? currentSessionName.value : dialogueStatus.value,
  )

  watch(
    [() => sessionNodeKey(currentSocraticSession.value), () => store.nodes, socraticCurrentId],
    ([nodeKey, nodes]) => {
      const session = currentSocraticSession.value
      if (session?.topicId !== currentTopicId.value) return
      const node = nodes.find((item) => item.id === nodeKey)
      if (node) store.setActiveNode(node)
      else if (session.nodeKey === null) store.setActiveNode(null)
    },
    { immediate: true },
  )

  const modelsStore = useModelsStore()

  const attachmentDrafts = useAttachmentDrafts(
    computed(() => ({
      session_id: currentSessionId.value,
      mode: chatMode.value,
      topic_id:
        chatMode.value === 'socratic'
          ? (currentSession.value?.topicId ?? currentTopicId.value)
          : undefined,
    })),
  )

  const attachmentDisabledReason = computed(() => {
    if (chatMode.value === 'normal') return ''
    if (activeAgentRun.value || draftTopic.value)
      return '诊断、测评和计划确认阶段不能添加附件，已有草稿会保留'
    if (currentSession.value?.awaitingTopicChoice) return '请先完成主题选择，已有附件草稿会保留'
    if (!store.activeNode || !currentSession.value?.topicId) return '请先选择已有主题的学习节点'
    if (
      Number(store.activeTopicId) !== currentSession.value.topicId ||
      !store.nodes.some((n) => n.id === store.activeNode?.id)
    )
      return '请在本对话主题中选择有效节点'
    return ''
  })

  const attachmentsEnabled = computed(() => !attachmentDisabledReason.value)

  const socraticBadge = computed(() =>
    Math.max(
      0,
      currentSocraticSession.value.messages.filter(
        (message) => !message.messageType || message.messageType === 'chat',
      ).length - 1,
    ),
  )

  const normalBadge = computed(() => Math.max(0, currentNormalSession.value.messages.length - 1))

  const hideSocraticWelcome = computed(
    () =>
      chatMode.value === 'socratic' &&
      (Boolean(draftTopic.value || agentStore.run || currentSession.value?.topicId) ||
        messages.value.some((message) => message.messageType && message.messageType !== 'chat')),
  )

  const placeholder = computed(() =>
    chatMode.value === 'socratic'
      ? agentStore.run?.step
        ? `${agentStore.run.type === 'assessment' ? '回答评估' : '回答诊断'} ${agentStore.run.step.current}/${agentStore.run.step.total}`
        : '回答问题，或问我一个反问…'
      : '随便问我点什么…',
  )

  const messages = computed({
    get: () => currentSession.value?.messages ?? [],
    set: (val) => {
      if (!currentSession.value) return
      currentSession.value.messages = val
      currentSession.value.updatedAt = nowDate()
      saveSessions()
    },
  })

  const replacingMessageIndex = computed(() =>
    activeReplacementMessage.value ? messages.value.indexOf(activeReplacementMessage.value) : -1,
  )

  const retryUserIndex = computed(() => {
    if (!retryUserMessage.value) return undefined
    if (!retryRequest.value) return -1
    const user = retryUserMessage.value
    return messages.value.findIndex(
      (message) =>
        message === user ||
        (message.role === 'user' && user.db_id != null && message.db_id === user.db_id),
    )
  })

  const currentStepInHistory = computed(() => {
    const run = agentStore.run
    if (!run?.step) return false
    return messages.value.some(
      (message) =>
        message.messageType === 'agent_step' &&
        message.metadata?.run_id === run.run_id &&
        message.metadata?.version === run.version,
    )
  })

  function pushMessage(msg: Message) {
    if (!currentSession.value) return
    currentSession.value.messages.push(msg)
    currentSession.value.updatedAt = nowDate()
    if (msg.role === 'user') void sessionTitles.ensureTitle(currentSession.value)
    saveSessions()
  }

  const { findOrCreateTopicSession, inheritTopicAvatar, rebuildFromBackend } = useDialogueHistory({
    socraticSessions,
    normalSessions,
    topics: () => store.topics,
    createDefaultSession,
    saveSessions,
    parseChoices,
    inferSelectedChoices,
  })

  function inheritCurrentTopicAvatar(session: Session, topicId: number) {
    inheritTopicAvatar(session, topicId, defaultAiAvatar)
  }

  const { prepareTopicChoice, handlePendingTopicChoice } = useSessionTopicChoice({
    currentSession,
    topics: () => store.topics,
    pushMessage,
    saveSessions,
    setActiveTopic: store.setActiveTopic,
    inheritTopicAvatar: inheritCurrentTopicAvatar,
  })

  function scrollToBottom() {
    messageListRef.value?.scrollToBottom()
  }

  function resetScrollToBottom() {
    messageListRef.value?.scrollToBottom(true)
  }

  watch(currentSessionId, resetScrollToBottom)

  function blockDuringAssessment() {
    if (!assessmentActive.value) return false
    chatError.value = '请先完成评估或点击“放弃评估”，再继续对话。'
    return true
  }

  function clearQuote() {
    quotedText.value = ''
    quotedSource.value = null
  }

  function clearStreamingState() {
    activeStream.value = null
    activeStreamMessageIds.value = null
    activeStreamUserMessage.value = null
    streamingText.value = ''
    streamingWeb.value = undefined
    streamingChoices.value = null
    isThinking.value = false
  }

  return {
    store,
    agentStore,
    plansStore,
    streamControl,
    clearStreamingState,
    parseChoices,
    inferSelectedChoices,
    socraticSessions,
    normalSessions,
    socraticCurrentId,
    normalCurrentId,
    createDefaultSession,
    saveSessions,
    disposeSessionPersistence,
    sessionTitles,
    messageListRef,
    inputBarRef,
    streamEpoch,
    activeStreamMessageIds,
    activeReplacementMessage,
    activeStreamUserMessage,
    activeStream,
    chatError,
    retryRequest,
    retryUserMessage,
    input,
    isThinking,
    isGenerating,
    streamingText,
    streamingWeb,
    streamingChoices,
    quotedText,
    quotedSource,
    showHistory,
    historyPanelRef,
    avatarPickerSessionId,
    avatarPickerBusy,
    avatarPickerError,
    editingSessionId,
    editingName,
    editingSessionInHeader,
    savingSessionName,
    sessionNameError,
    sessionNameInputRef,
    sessionNameButtonRef,
    pendingSessionDelete,
    deletingSession,
    sessionDeleteError,
    masteryConfirm,
    assessmentResult,
    assessmentHistoryOpen,
    startingAssessment,
    currentTopicId,
    chatMode,
    aiStyleOptions,
    aiStyle,
    currentSessionId,
    currentSessions,
    currentSocraticSession,
    currentNormalSession,
    currentSession,
    aiAvatarUrl,
    pickerSession,
    pickerAvatarUrl,
    currentSessionName,
    canRenameCurrentSession,
    activeAgentRun,
    assessmentActive,
    assessmentCanAnswer,
    draftTopic,
    currentSessionNode,
    currentSessionTitle,
    dialogueStatus,
    currentSessionSubtitle,
    modelsStore,
    attachmentDrafts,
    attachmentDisabledReason,
    attachmentsEnabled,
    socraticBadge,
    normalBadge,
    hideSocraticWelcome,
    placeholder,
    messages,
    replacingMessageIndex,
    retryUserIndex,
    currentStepInHistory,
    pushMessage,
    findOrCreateTopicSession,
    inheritTopicAvatar,
    rebuildFromBackend,
    inheritCurrentTopicAvatar,
    prepareTopicChoice,
    handlePendingTopicChoice,
    scrollToBottom,
    resetScrollToBottom,
    blockDuringAssessment,
    clearQuote,
  }
}

export type DialogueState = ReturnType<typeof useDialogueState>
