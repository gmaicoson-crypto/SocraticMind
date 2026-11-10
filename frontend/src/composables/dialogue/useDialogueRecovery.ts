import { watch, nextTick, onBeforeMount, onBeforeUnmount } from 'vue'
import { getChatRequestState, type ChatRequestState } from '../../api/chat'
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
  | 'store'
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
    store,
  } = context

  const pendingRequestKey = 'sm_pending_chat_requests'

  let recoveryTimer: ReturnType<typeof setTimeout> | undefined
  let disposed = false

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

  function recoverRequest(
    sessionId: string,
    requestId: string,
    epoch: number,
    failedStream?: StreamContext,
  ) {
    if (
      streamEpoch.value !== epoch ||
      currentSession.value?.id !== sessionId ||
      activeStream.value ||
      pendingRequests()[sessionId] !== requestId
    )
      return

    const stream: StreamContext = {
      epoch,
      sessionId,
      requestId,
      controller: new AbortController(),
      replacing: false,
      recovering: true,
      retry: failedStream?.retry,
      userMessage: failedStream?.userMessage,
      onPartial: failedStream?.onPartial,
      onCancelled: (ids) => {
        if (!failedStream) return
        failedStream.cancelled = true
        failedStream.onCancelled?.(ids)
      },
    }
    activeStream.value = stream
    isThinking.value = true
    retryRequest.value = null
    void pollRecovery(stream, failedStream)
  }

  function isCurrentRecovery(stream: StreamContext) {
    if (
      activeStream.value !== stream ||
      streamEpoch.value !== stream.epoch ||
      currentSession.value?.id !== stream.sessionId
    )
      return false
    if (pendingRequests()[stream.sessionId] === stream.requestId) return true
    // A previously requested cancellation can be confirmed after re-entering the session.
    clearStreamingState()
    return false
  }

  async function pollRecovery(stream: StreamContext, failedStream?: StreamContext) {
    if (!isCurrentRecovery(stream)) return
    const { sessionId, requestId } = stream
    let state: ChatRequestState
    try {
      state = await getChatRequestState(requestId)
      if (!isCurrentRecovery(stream)) return
      if (state.request_id !== requestId || (state.session_id && state.session_id !== sessionId)) {
        throw new Error('回复状态与当前请求不一致')
      }
    } catch (cause) {
      if (!isCurrentRecovery(stream)) return
      const status = (cause as { response?: { status?: number } }).response?.status
      if (status === 404) {
        rememberRequest(sessionId, null, requestId)
        clearStreamingState()
        chatError.value = '请求未被服务端接收，请重试。'
        retryRequest.value = failedStream?.retry ?? null
        retryUserMessage.value = failedStream?.userMessage ?? null
        return
      }
      chatError.value = '暂时无法确认回复状态，将自动重试。'
      recoveryTimer = setTimeout(() => void pollRecovery(stream, failedStream), 5000)
      return
    }

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
      activeStreamMessageIds.value = state.msg_ids ?? null
      const partialReply = currentSession.value?.messages.find(
        (message) =>
          message.role === 'ai' && message.db_id != null && message.db_id === state.msg_ids?.ai,
      )
      stream.replacing = Boolean(partialReply)
      streamingText.value = partialReply?.text ?? ''
      streamingChoices.value = partialReply?.choices ?? null
      streamingWeb.value = messageWeb(partialReply?.metadata)
      recoveryTimer = setTimeout(() => void pollRecovery(stream, failedStream), 2000)
      return
    }

    const expectedReply =
      state.status === 'complete' && state.msg_ids
        ? { sessionId, messageId: state.msg_ids.ai }
        : undefined
    const restored = await rebuildFromBackend(() => isCurrentRecovery(stream), expectedReply)
    if (!isCurrentRecovery(stream)) return
    if (!restored) {
      chatError.value = '暂时无法加载回复，将自动重试。'
      recoveryTimer = setTimeout(() => void pollRecovery(stream, failedStream), 5000)
      return
    }
    rememberRequest(sessionId, null, requestId)
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
    await sessionTitles.refreshTitles()
  }

  // Navigation installs its reset watchers during setup. Register recovery after
  // them so the epoch is captured only once the target session has been reset.
  onBeforeMount(() => {
    const resumeCurrentSession = () => {
      if (disposed) return
      const sessionId = currentSessionId.value
      const requestId = pendingRequests()[sessionId]
      if (requestId) recoverRequest(sessionId, requestId, streamEpoch.value)
    }
    watch([currentSessionId, chatMode, () => store.userInfo?.id], resumeCurrentSession, {
      flush: 'post',
    })
    void nextTick(resumeCurrentSession)
  })

  onBeforeUnmount(() => {
    disposed = true
  })

  function stopRecovery() {
    clearTimeout(recoveryTimer)
  }

  return { pendingRequests, rememberRequest, recoverRequest, stopRecovery }
}
