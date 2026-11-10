import { watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
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
  | 'agentStore'
  | 'rebuildFromBackend'
  | 'sessionTitles'
  | 'resetScrollToBottom'
  | 'findOrCreateTopicSession'
  | 'assessmentActive'
  | 'disposeSessionPersistence'
> &
  Pick<ReturnType<typeof useDialogueStreaming>, 'resetStreamForNavigation'> &
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
    agentStore,
    rebuildFromBackend,
    sessionTitles,
    resetScrollToBottom,
    findOrCreateTopicSession,
    assessmentActive,
    disposeSessionPersistence,
    resetStreamForNavigation,
    assessmentFlow,
    onboardingFlow,
    streamOverview,
  } = context

  let isHydrated = false
  let draftSessionId: string | null = null

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

  function resetSessionInteraction({ preserveDraft = false } = {}) {
    assessmentResult.value = null
    assessmentHistoryOpen.value = false
    editingSessionId.value = null
    editingSessionInHeader.value = false
    sessionNameError.value = ''
    activeReplacementMessage.value = null
    clearQuote()
    resetStreamForNavigation()
    chatError.value = ''
    retryRequest.value = null
    retryUserMessage.value = null
    agentStore.clearRun()
    if (!preserveDraft) {
      draftSessionId = null
      agentStore.closeOnboarding()
      agentStore.closeTopicPlan()
    }
  }

  function isDraftSession() {
    return chatMode.value === 'socratic' && currentSessionId.value === draftSessionId
  }

  function persistBeforePageHide() {
    saveSessions(true)
  }

  onMounted(() => {
    saveSessions(true)
    window.addEventListener('pagehide', persistBeforePageHide)
    syncSessionTopic(currentSocraticSession.value)
    // The initial graph sync should preserve the restored chat mode.
    void nextTick(() => {
      isHydrated = true
    })
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

  watch(
    [() => agentStore.onboardingTopic, () => agentStore.topicPlanDraft],
    ([topic, draft]) => {
      if (!topic && !draft) {
        draftSessionId = null
        return
      }
      let session = currentSocraticSession.value
      if (draft) {
        session = findOrCreateTopicSession(draft.topicId)
      } else if (session.topicId != null) {
        session = createDefaultSession('socratic')
        session.awaitingTopicChoice = false
        socraticSessions.value.unshift(session)
      }
      draftSessionId = session.id
      chatMode.value = 'socratic'
      if (socraticCurrentId.value !== session.id) {
        socraticCurrentId.value = session.id
        showHistory.value = false
        saveSessions()
      }
      syncSessionTopic(session)
      resetScrollToBottom()
    },
    { immediate: true },
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
    [
      () => store.userInfo?.id,
      chatMode,
      () => (chatMode.value === 'socratic' ? socraticCurrentId.value : null),
    ],
    async ([userId, mode], [previousUserId, previousMode], onCleanup) => {
      const modeChanged = previousMode != null && mode !== previousMode
      if (!modeChanged && userId === previousUserId && (!userId || mode === 'normal')) return
      const sameUser = previousUserId == null || userId === previousUserId
      resetSessionInteraction({ preserveDraft: sameUser && isDraftSession() })
      if (modeChanged) {
        saveSessions()
        scrollToBottom()
      }
      if (!userId || mode !== 'socratic') return
      let stale = false
      onCleanup(() => {
        stale = true
      })
      const restoredAssessment = await assessmentFlow.restore()
      if (!stale && !restoredAssessment) await onboardingFlow.restore()
      if (!stale) scrollToBottom()
    },
    { immediate: true },
  )

  watch(
    [() => store.activeTopicId, chatMode],
    async ([activeTopicId, mode], previous, onCleanup) => {
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
        if (isHydrated && previousTopicId !== undefined && activeTopicId !== previousTopicId) {
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
        if (!title) return
        const sessionId = currentSessionId.value
        let stale = false
        onCleanup(() => {
          stale = true
        })
        // Let the target session claim its pending recovery before auto-sending.
        await nextTick()
        if (!stale && currentSessionId.value === sessionId) await streamOverview('topic', title)
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
    resetStreamForNavigation()
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
