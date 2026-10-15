import { watch, nextTick, onBeforeMount, onBeforeUnmount } from 'vue'
import { getChatRequestState } from '../../api/chat'
import { messageWeb } from '../../utils/webSearch'
import type { StreamContext } from './types'
import type { DialogueState } from './useDialogueState'

type Context = Pick<
  DialogueState,
  | 'clearStreamingState'
  | 'streamEpoch'
  | 'currentSession'
  | 'attachmentDrafts'
  | 'chatMode'
  | 'saveSessions'
  | 'isThinking'
  | 'retryRequest'
  | 'activeStream'
  | 'activeStreamMessageIds'
  | 'streamingText'
  | 'streamingChoices'
  | 'streamingWeb'
  | 'chatError'
  | 'retryUserMessage'
  | 'rebuildFromBackend'
  | 'sessionTitles'
  | 'currentSessionId'
>

export function useDialogueRecovery(context: Context) {
  const {
    clearStreamingState,
    streamEpoch,
    currentSession,
    attachmentDrafts,
    chatMode,
    saveSessions,
    isThinking,
    retryRequest,
    activeStream,
    activeStreamMessageIds,
    streamingText,
    streamingChoices,
    streamingWeb,
    chatError,
    retryUserMessage,
    rebuildFromBackend,
    sessionTitles,
    currentSessionId,
  } = context

  const pendingRequestKey = 'sm_pending_chat_requests'

  let recoveryTimer: ReturnType<typeof setTimeout> | undefined

  function pendingRequests(): Record<string, string> {
    try {
      return JSON.parse(localStorage.getItem(pendingRequestKey) ?? '{}')
    } catch {
      return {}
    }
  }

  function rememberRequest(
    sessionId: string,
    requestId: string | null,
    expectedRequestId?: string,
  ) {
    const pending = pendingRequests()
    // A cancellation may finish after another turn has started in this session.
    if (expectedRequestId && pending[sessionId] !== expectedRequestId) return
    if (requestId) pending[sessionId] = requestId
    else delete pending[sessionId]
    localStorage.setItem(pendingRequestKey, JSON.stringify(pending))
  }

  async function recoverRequest(
    sessionId: string,
    requestId: string,
    epoch: number,
    failedStream?: StreamContext,
  ) {
    if (streamEpoch.value !== epoch || currentSession.value?.id !== sessionId) return
    try {
      const state = await getChatRequestState(requestId)
      if (streamEpoch.value !== epoch || currentSession.value?.id !== sessionId) return
      if (state.session_id && state.session_id !== sessionId) return
      if (state.msg_ids) failedStream?.onRecovered?.(state.msg_ids)
      const localUser = currentSession.value?.messages.find(
        (message) => message.role === 'user' && message.metadata?.pending_request_id === requestId,
      )
      if (localUser && state.msg_ids) {
        localUser.db_id = state.msg_ids.user
        attachmentDrafts.consume(
          localUser.attachments?.map((attachment) => attachment.id) ?? [],
          `${chatMode.value}:${sessionId}`,
        )
        saveSessions()
      }
      if (state.status === 'generating') {
        isThinking.value = true
        retryRequest.value = null
        if (!activeStream.value)
          activeStream.value = {
            epoch,
            sessionId,
            requestId,
            controller: new AbortController(),
            replacing: false,
            retry: failedStream?.retry,
            userMessage: failedStream?.userMessage,
            onPartial: failedStream?.onPartial,
            onCancelled: (ids) => {
              if (!failedStream) return
              failedStream.cancelled = true
              failedStream.onCancelled?.(ids)
            },
          }
        activeStreamMessageIds.value = state.msg_ids ?? null
        const partialReply = currentSession.value?.messages.find(
          (message) =>
            message.role === 'ai' && message.db_id != null && message.db_id === state.msg_ids?.ai,
        )
        activeStream.value.replacing = Boolean(partialReply)
        streamingText.value = partialReply?.text ?? ''
        streamingChoices.value = partialReply?.choices ?? null
        streamingWeb.value = messageWeb(partialReply?.metadata)
        recoveryTimer = setTimeout(
          () => void recoverRequest(sessionId, requestId, epoch, failedStream),
          2000,
        )
        return
      }
      rememberRequest(sessionId, null)
      clearStreamingState()
      if (state.status !== 'complete') {
        chatError.value = state.error?.message || '此前回复已中断，可从消息重新生成。'
        retryRequest.value = state.error?.retryable === false ? null : (failedStream?.retry ?? null)
        retryUserMessage.value = failedStream?.userMessage ?? null
      } else {
        chatError.value = ''
        retryRequest.value = null
        retryUserMessage.value = null
      }
      await rebuildFromBackend()
      await sessionTitles.refreshTitles()
    } catch (cause) {
      if (streamEpoch.value !== epoch) return
      const status = (cause as { response?: { status?: number } }).response?.status
      if (status === 404) {
        rememberRequest(sessionId, null)
        clearStreamingState()
        chatError.value = '请求未被服务端接收，请重试。'
        retryRequest.value = failedStream?.retry ?? null
        retryUserMessage.value = failedStream?.userMessage ?? null
        return
      }
      chatError.value = '暂时无法确认回复状态，将自动重试。'
      recoveryTimer = setTimeout(
        () => void recoverRequest(sessionId, requestId, epoch, failedStream),
        5000,
      )
    }
  }

  // Navigation installs its reset watchers during setup. Register recovery after
  // them so the epoch is captured only once the target session has been reset.
  onBeforeMount(() => {
    watch(
      currentSessionId,
      (sessionId) => {
        clearTimeout(recoveryTimer)
        const requestId = pendingRequests()[sessionId]
        if (requestId) {
          const epoch = streamEpoch.value
          void nextTick(() => recoverRequest(sessionId, requestId, epoch))
        }
      },
      { immediate: true, flush: 'post' },
    )
  })

  onBeforeUnmount(() => clearTimeout(recoveryTimer))

  function stopRecovery() {
    clearTimeout(recoveryTimer)
  }

  return { pendingRequests, rememberRequest, recoverRequest, stopRecovery }
}
