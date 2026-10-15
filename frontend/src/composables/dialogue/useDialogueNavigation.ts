import { watch, onMounted, onBeforeUnmount } from 'vue'
import type { DialogueSession as Session } from '../../types'
import type { DialogueState } from './useDialogueState'
import type { useDialogueStreaming } from './useDialogueStreaming'
import type { useDialogueAgent } from './useDialogueAgent'
import type { useDialogueSend } from './useDialogueSend'

type Context = Pick<
  DialogueState,
  | 'currentSessionId'
  | 'blockDuringAssessment'
  | 'chatMode'
  | 'socraticCurrentId'
  | 'currentSocraticSession'
  | 'normalCurrentId'
  | 'showHistory'
  | 'saveSessions'
  | 'scrollToBottom'
  | 'store'
  | 'socraticSessions'
  | 'createDefaultSession'
  | 'prepareTopicChoice'
  | 'normalSessions'
  | 'assessmentResult'
  | 'assessmentHistoryOpen'
  | 'editingSessionId'
  | 'editingSessionInHeader'
  | 'sessionNameError'
  | 'activeReplacementMessage'
  | 'clearQuote'
  | 'chatError'
  | 'retryRequest'
  | 'retryUserMessage'
  | 'clearStreamingState'
  | 'streamEpoch'
  | 'streamControl'
  | 'agentStore'
  | 'rebuildFromBackend'
  | 'sessionTitles'
  | 'resetScrollToBottom'
  | 'findOrCreateTopicSession'
  | 'assessmentActive'
  | 'disposeSessionPersistence'
> &
  Pick<ReturnType<typeof useDialogueStreaming>, 'cancelActiveStream'> &
  Pick<ReturnType<typeof useDialogueAgent>, 'assessmentFlow' | 'onboardingFlow'> &
  Pick<ReturnType<typeof useDialogueSend>, 'streamOverview'>

export function useDialogueNavigation(context: Context) {
  const {
    currentSessionId,
    blockDuringAssessment,
    chatMode,
    socraticCurrentId,
    currentSocraticSession,
    normalCurrentId,
    showHistory,
    saveSessions,
    scrollToBottom,
    store,
    socraticSessions,
    createDefaultSession,
    prepareTopicChoice,
    normalSessions,
    assessmentResult,
    assessmentHistoryOpen,
    editingSessionId,
    editingSessionInHeader,
    sessionNameError,
    activeReplacementMessage,
    clearQuote,
    chatError,
    retryRequest,
    retryUserMessage,
    clearStreamingState,
    streamEpoch,
    streamControl,
    agentStore,
    rebuildFromBackend,
    sessionTitles,
    resetScrollToBottom,
    findOrCreateTopicSession,
    assessmentActive,
    disposeSessionPersistence,
    cancelActiveStream,
    assessmentFlow,
    onboardingFlow,
    streamOverview,
  } = context

  let isHydrated = false

  function switchSession(id: string) {
    if (id === currentSessionId.value) return
    if (blockDuringAssessment()) return
    resetSessionInteraction()
    if (chatMode.value === 'socratic') {
      socraticCurrentId.value = id
      syncSessionTopic(currentSocraticSession.value)
    } else normalCurrentId.value = id
    showHistory.value = false
    saveSessions()
    scrollToBottom()
  }

  function syncSessionTopic(session: Session) {
    if (session.topicId == null) {
      store.clearGraph()
    } else if (store.activeTopicId !== String(session.topicId)) {
      void store.setActiveTopic(String(session.topicId))
    }
  }

  function newSession() {
    if (blockDuringAssessment()) return
    resetSessionInteraction()
    const previous =
      currentSocraticSession.value?.topicId != null
        ? currentSocraticSession.value
        : socraticSessions.value.find((session) => session.topicId != null)
    const session = createDefaultSession(chatMode.value)
    if (chatMode.value === 'socratic') {
      prepareTopicChoice(session, previous)
      socraticSessions.value.unshift(session)
      socraticCurrentId.value = session.id
      syncSessionTopic(session)
    } else {
      normalSessions.value.unshift(session)
      normalCurrentId.value = session.id
    }
    showHistory.value = false
    saveSessions()
    scrollToBottom()
  }

  function resetSessionInteraction() {
    assessmentResult.value = null
    assessmentHistoryOpen.value = false
    editingSessionId.value = null
    editingSessionInHeader.value = false
    sessionNameError.value = ''
    activeReplacementMessage.value = null
    clearQuote()
    cancelActiveStream()
    chatError.value = ''
    retryRequest.value = null
    retryUserMessage.value = null
    streamEpoch.value += 1
    streamControl.abortRequest()
    clearStreamingState()
    agentStore.clearRun()
    agentStore.closeOnboarding()
    agentStore.closeTopicPlan()
  }

  function persistBeforePageHide() {
    saveSessions(true)
  }

  onMounted(() => {
    saveSessions(true)
    window.addEventListener('pagehide', persistBeforePageHide)
    syncSessionTopic(currentSocraticSession.value)
    isHydrated = true
  })

  watch(
    () => [store.topics.length, store.userInfo?.id] as const,
    ([, userId]) => {
      if (userId) {
        void rebuildFromBackend().then(() => sessionTitles.refreshTitles())
      }
    },
    { immediate: true },
  )

  function changeChatMode(mode: 'socratic' | 'normal') {
    if (mode === chatMode.value || blockDuringAssessment()) return
    chatMode.value = mode
  }

  watch(chatMode, (mode, previousMode) => {
    if (mode !== previousMode) resetSessionInteraction()

    scrollToBottom()
  })

  watch(
    () => agentStore.onboardingTopic,
    (topic) => {
      if (!topic) return
      chatMode.value = 'socratic'
      if (currentSocraticSession.value?.topicId != null) {
        const session = createDefaultSession('socratic')
        session.awaitingTopicChoice = false
        socraticSessions.value.unshift(session)
        socraticCurrentId.value = session.id
        saveSessions()
      }
      syncSessionTopic(currentSocraticSession.value)
      resetScrollToBottom()
    },
  )

  watch(
    () => agentStore.topicPlanDraft,
    (draft) => {
      if (!draft) return
      chatMode.value = 'socratic'
      const session = findOrCreateTopicSession(draft.topicId)
      syncSessionTopic(session)
      if (socraticCurrentId.value !== session.id) {
        socraticCurrentId.value = session.id
        showHistory.value = false
        saveSessions()
      }
      resetScrollToBottom()
    },
  )

  watch(
    () => agentStore.preview,
    (preview) => {
      if (preview && chatMode.value === 'socratic') {
        requestAnimationFrame(scrollToBottom)
      }
    },
    { flush: 'post' },
  )

  watch(
    [() => store.userInfo?.id, socraticCurrentId],
    async ([userId]) => {
      if (!userId) return
      resetSessionInteraction()
      const restoredAssessment = await assessmentFlow.restore()
      if (!restoredAssessment) await onboardingFlow.restore()
      scrollToBottom()
    },
    { immediate: true },
  )

  watch(
    [() => store.activeTopicId, chatMode],
    async ([activeTopicId, mode], previous) => {
      if (assessmentActive.value) {
        const topicId = currentSocraticSession.value?.topicId
        if (topicId && activeTopicId !== String(topicId)) {
          blockDuringAssessment()
          await store.setActiveTopic(String(topicId))
        }
        store.requestTopicOverview(null)
        return
      }
      const previousTopicId = previous?.[0]
      if (mode !== 'socratic') {
        if (previousTopicId !== undefined && activeTopicId !== previousTopicId) {
          chatMode.value = 'socratic'
        }
        return
      }
      const numId = Number(activeTopicId)
      if (!numId) return
      if (currentSocraticSession.value?.topicId !== numId) {
        const session = findOrCreateTopicSession(numId)
        if (socraticCurrentId.value !== session.id) {
          socraticCurrentId.value = session.id
          showHistory.value = false
          saveSessions()
          scrollToBottom()
        }
      }

      if (store.pendingTopicOverviewId === numId && isHydrated) {
        const title = store.topics.find((t) => Number(t.id) === numId)?.title
        store.requestTopicOverview(null)
        if (title) await streamOverview('topic', title)
      }
    },
    { immediate: true },
  )

  watch(
    () => store.topics,
    (topics) => {
      const validIds = new Set(topics.map((t) => Number(t.id)))
      let mutated = false
      const next: Session[] = []
      for (const s of socraticSessions.value) {
        if (s.topicId == null) {
          next.push(s)
          continue
        }
        if (!validIds.has(s.topicId)) {
          mutated = true
          continue
        }
        const t = topics.find((x) => Number(x.id) === s.topicId)
        if (t && s.topicTitle !== t.title) {
          s.topicTitle = t.title
          mutated = true
        }
        next.push(s)
      }

      if (next.length === 0) {
        next.push(createDefaultSession('socratic'))
        mutated = true
      }
      if (mutated) {
        socraticSessions.value = next
        if (!next.find((s) => s.id === socraticCurrentId.value)) {
          socraticCurrentId.value = next[0].id
        }
        saveSessions()
      }
    },
  )

  onBeforeUnmount(() => {
    window.removeEventListener('pagehide', persistBeforePageHide)
    disposeSessionPersistence()
    cancelActiveStream()
    streamEpoch.value += 1
    streamControl.abortRequest()
  })

  return {
    switchSession,
    syncSessionTopic,
    newSession,
    resetSessionInteraction,
    persistBeforePageHide,
    changeChatMode,
  }
}
