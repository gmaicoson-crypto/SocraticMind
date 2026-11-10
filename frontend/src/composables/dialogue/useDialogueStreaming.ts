import type { Message } from '../../types'
import { chatStream, cancelChatStream } from '../../api/chat'
import { now, hasMessageContent } from '../../utils/chat'
import { getSelectedModelId } from '../../utils/modelSelection'
import { webSnapshotForText } from '../../utils/messageMarkdown'
import { chatErrorMessage } from './errors'
import type { StreamContext, DialogueRequest } from './types'
import type { DialogueState } from './useDialogueState'
import { useDialogueRecovery } from './useDialogueRecovery'

type Context = Parameters<typeof useDialogueRecovery>[0] &
  Pick<
    DialogueState,
    | 'activeStream'
    | 'chatError'
    | 'activeReplacementMessage'
    | 'streamControl'
    | 'clearStreamingState'
    | 'streamEpoch'
    | 'activeStreamMessageIds'
    | 'activeStreamUserMessage'
    | 'retryRequest'
    | 'retryUserMessage'
    | 'currentSession'
    | 'isThinking'
    | 'streamingText'
    | 'streamingWeb'
    | 'streamingChoices'
    | 'parseChoices'
    | 'pushMessage'
    | 'scrollToBottom'
    | 'blockDuringAssessment'
    | 'saveSessions'
    | 'resetScrollToBottom'
    | 'attachmentDrafts'
  >

export function useDialogueStreaming(context: Context) {
  const {
    activeStream,
    chatError,
    activeReplacementMessage,
    streamControl,
    clearStreamingState,
    streamEpoch,
    activeStreamMessageIds,
    activeStreamUserMessage,
    retryRequest,
    retryUserMessage,
    currentSession,
    isThinking,
    streamingText,
    streamingWeb,
    streamingChoices,
    parseChoices,
    pushMessage,
    scrollToBottom,
    blockDuringAssessment,
    saveSessions,
    resetScrollToBottom,
    attachmentDrafts,
  } = context

  const { pendingRequests, rememberRequest, recoverRequest, stopRecovery } =
    useDialogueRecovery(context)

  async function cancelActiveStream() {
    const stream = activeStream.value
    activeStream.value = null
    if (!stream) return 'cancelled'
    try {
      const response = await cancelChatStream(stream.sessionId, stream.requestId)
      if (response?.status === 'complete') return 'complete'
      stream.cancelled = true
      rememberRequest(stream.sessionId, null, stream.requestId)
      stream.onCancelled?.(response?.msg_ids)
      return 'cancelled'
    } catch (error) {
      if (
        currentSession.value?.id === stream.sessionId &&
        pendingRequests()[stream.sessionId] === stream.requestId
      ) {
        chatError.value = `停止请求未确认：${chatErrorMessage(error)}`
      }
      return 'unconfirmed'
    }
  }

  function resetStreamForNavigation() {
    stopRecovery()
    // Detach the view from the request. Its persisted ID lets recovery reattach.
    streamEpoch.value += 1
    streamControl.abortRequest()
    clearStreamingState()
  }

  function beginStream(sessionId: string, requestId: string = crypto.randomUUID()): StreamContext {
    activeReplacementMessage.value = null
    cancelActiveStream()
    const controller = streamControl.beginRequest()
    const context = {
      epoch: ++streamEpoch.value,
      sessionId,
      requestId,
      controller,
      replacing: false,
    }
    activeStreamMessageIds.value = null
    activeStreamUserMessage.value = null
    activeStream.value = context
    chatError.value = ''
    retryRequest.value = null
    retryUserMessage.value = null
    return context
  }

  function isCurrentStream(context: StreamContext): boolean {
    return (
      activeStream.value === context &&
      context.epoch === streamEpoch.value &&
      context.sessionId === currentSession.value?.id &&
      !context.controller.signal.aborted
    )
  }

  function abortChat() {
    const messageIds = activeStreamMessageIds.value
    const userMessage = activeStreamUserMessage.value
    const stoppingStream = activeStream.value
    const replacing = stoppingStream?.replacing
    const onPartial = stoppingStream?.onPartial
    retryRequest.value = null
    chatError.value = ''
    stopRecovery()
    const cancellation = cancelActiveStream()
    const stoppedEpoch = ++streamEpoch.value
    void cancellation.then((outcome) => {
      if (streamEpoch.value !== stoppedEpoch || isThinking.value) return
      if (outcome === 'complete' && stoppingStream) {
        recoverRequest(
          stoppingStream.sessionId,
          stoppingStream.requestId,
          stoppedEpoch,
          stoppingStream,
        )
        return
      }
      if (outcome === 'cancelled') chatError.value = '回复已停止。'
      retryRequest.value = stoppingStream?.retry ?? null
      retryUserMessage.value = stoppingStream?.userMessage ?? null
    })
    streamControl.abortRequest()
    const partial = streamingText.value.trim()
    clearStreamingState()
    const { cleanText, choices } = parseChoices(partial)
    if (hasMessageContent({ text: cleanText, choices: choices ?? undefined }) && !replacing) {
      if (messageIds && userMessage) userMessage.db_id = messageIds.user
      const partialMessage: Message = {
        role: 'ai',
        text: cleanText,
        time: now(),
        choices: choices ?? undefined,
        db_id: messageIds?.ai,
        metadata: { status: 'interrupted', web: webSnapshotForText(stoppingStream?.web, partial) },
        paired_db_id: userMessage ? undefined : messageIds?.user,
      }
      pushMessage(partialMessage)
      onPartial?.(currentSession.value!.messages.at(-1)!)
    }
    scrollToBottom()
  }

  function streamDialogue(request: DialogueRequest): Promise<void> {
    if (blockDuringAssessment() || activeStream.value?.recovering) return Promise.resolve()
    const session = currentSession.value
    if (!session) return Promise.resolve()
    // Freeze ids before dispatch; retry closures never read the current input draft.
    request = { ...request, attachmentIds: [...(request.attachmentIds ?? [])] }
    if (request.mode === 'socratic' && !request.regenerateMessageId && !request.replaceMessage) {
      session.nodeKey = request.kind === 'topic_overview' ? null : request.nodeKey
      saveSessions()
    }
    const stream = beginStream(session.id, request.requestId)
    stopRecovery()
    rememberRequest(session.id, stream.requestId)
    if (request.userMessage) {
      request.userMessage.metadata = {
        ...request.userMessage.metadata,
        pending_request_id: stream.requestId,
      }
      saveSessions()
    }
    const modelId = request.modelId !== undefined ? request.modelId : getSelectedModelId()
    stream.replacing = Boolean(request.replaceMessage)
    activeReplacementMessage.value = request.replaceMessage ?? null
    stream.userMessage = request.userMessage
    activeStreamUserMessage.value = request.userMessage ?? null
    isThinking.value = true
    streamingText.value = ''
    streamingWeb.value = undefined
    streamingChoices.value = null
    resetScrollToBottom()
    return new Promise((resolve) => {
      stream.controller.signal.addEventListener('abort', () => resolve(), { once: true })
      let messageIds: { user: number; ai: number } | null = null
      let replaceMessage = request.replaceMessage
      stream.onRecovered = stream.onCancelled = (ids) => {
        if (!ids) return
        messageIds = ids
        if (request.userMessage) request.userMessage.db_id = ids.user
        attachmentDrafts.consume(request.attachmentIds ?? [], request.attachmentScopeKey)
        if (replaceMessage && !request.replaceMessage) {
          replaceMessage.db_id = ids.ai
          replaceMessage.chatRequest = requestContext()
        }
        saveSessions()
      }
      const requestContext = () => ({
        nodeKey: request.nodeKey,
        input: request.input,
        kind: request.kind ?? 'qa',
        userMessageId: messageIds?.user,
        attachmentIds: request.attachmentIds,
      })
      stream.onPartial = (message) => {
        replaceMessage = message
        message.chatRequest = requestContext()
        saveSessions()
      }
      stream.retry = () => {
        const current = currentSession.value
        if (!current || current.id !== session.id || isThinking.value) return
        // Recovery can replace local message objects with persisted history.
        const userMessage =
          current.messages.find(
            (message) =>
              message.role === 'user' &&
              message.db_id === request.userMessage?.db_id &&
              message.db_id != null,
          ) ?? request.userMessage
        const aiMessageId = messageIds?.ai
        const persistedReply =
          aiMessageId != null
            ? current.messages.find(
                (message) => message.role === 'ai' && message.db_id === aiMessageId,
              )
            : undefined
        const replacement =
          persistedReply ??
          current.messages.find(
            (message) =>
              message.role === 'ai' &&
              message.db_id === replaceMessage?.db_id &&
              message.db_id != null,
          ) ??
          replaceMessage
        void streamDialogue({
          ...request,
          userMessage,
          replaceMessage: replacement,
          modelId: messageIds || stream.cancelled ? undefined : modelId,
          requestId: messageIds || stream.cancelled ? undefined : stream.requestId,
          regenerateMessageId: messageIds?.ai ?? request.regenerateMessageId,
        })
      }
      const finish = () => {
        clearStreamingState()
        scrollToBottom()
        resolve()
      }
      const fail = (error: unknown) => {
        if (!isCurrentStream(stream)) return resolve()
        chatError.value = chatErrorMessage(error)
        const partial = streamingText.value.trim()
        const { cleanText, choices } = parseChoices(partial)
        if (
          hasMessageContent({ text: cleanText, choices: choices ?? undefined }) &&
          !request.replaceMessage
        ) {
          pushMessage({
            role: 'ai',
            text: cleanText,
            time: now(),
            choices: choices ?? undefined,
            db_id: messageIds?.ai,
            paired_db_id: request.userMessage ? undefined : messageIds?.user,
            chatRequest: requestContext(),
            metadata: { status: 'interrupted', web: webSnapshotForText(stream.web, partial) },
          })
          replaceMessage = session.messages.at(-1)
        }
        // An unknown network outcome reuses its key. A persisted failed answer
        // creates a new generation of the same question instead of submitting it again.
        const failure = error as { retryable?: boolean; code?: string } | null
        if (failure?.code === 'AI_OUTPUT_LIMIT') {
          chatError.value = request.replaceMessage
            ? '本次重新生成达到回复长度上限，已保留原回答。可以继续提问，或缩小问题范围。'
            : '回答达到本次生成长度上限，可输入“继续”接着回答。'
        }
        retryRequest.value =
          failure?.retryable === false && failure.code !== 'CHAT_SESSION_BUSY'
            ? null
            : (stream.retry ?? null)
        retryUserMessage.value = request.userMessage ?? null
        const transportFailure =
          error instanceof TypeError ||
          [
            'CHAT_STREAM_DISCONNECTED',
            'CHAT_STREAM_TIMEOUT',
            'CHAT_STREAM_EMPTY',
            'CHAT_REQUEST_RUNNING',
          ].includes(failure?.code ?? '')
        if (!transportFailure) rememberRequest(session.id, null)
        finish()
        if (transportFailure) {
          void recoverRequest(
            session.id,
            stream.requestId,
            stream.epoch,
            retryRequest.value ? stream : undefined,
          )
        }
      }
      void chatStream(
        {
          nodeKey: request.nodeKey,
          topicId: request.topicId,
          sessionId: session.id,
          userInput: request.input,
          requestId: stream.requestId,
          mode: request.mode,
          aiStyle: request.style,
          controller: stream.controller,
          kind: request.kind,
          quote: request.quote,
          regenerateMessageId: request.regenerateMessageId,
          modelId: modelId,
          attachmentIds: request.attachmentIds,
        },
        {
          onChunk: (chunk) => {
            if (!isCurrentStream(stream)) return
            streamingText.value += chunk
            checkStreamingChoices()
            scrollToBottom()
          },
          onDone: () => {
            if (!isCurrentStream(stream)) return resolve()
            rememberRequest(session.id, null)
            const content = streamingText.value.trim()
            const { cleanText, choices } = parseChoices(content)
            if (!hasMessageContent({ text: cleanText, choices: choices ?? undefined }))
              return fail(new Error('模型未返回可用的回答，请重试。'))
            const message: Message = {
              role: 'ai',
              text: cleanText,
              time: now(),
              choices: choices ?? undefined,
              db_id: messageIds?.ai,
              chatRequest: requestContext(),
              metadata: { web: stream.web },
              paired_db_id: request.userMessage ? undefined : messageIds?.user,
            }
            const replaceIndex = request.replaceMessage
              ? session.messages.indexOf(request.replaceMessage)
              : -1
            if (replaceIndex >= 0) {
              session.messages.splice(replaceIndex, 1, message)
              saveSessions()
            } else pushMessage(message)
            finish()
          },
          onError: fail,
          onMsgIds: (user, ai) => {
            if (!isCurrentStream(stream)) return
            messageIds = { user, ai }
            if (request.userMessage) request.userMessage.db_id = user
            activeStreamMessageIds.value = messageIds
            attachmentDrafts.consume(request.attachmentIds ?? [], request.attachmentScopeKey)
            saveSessions()
          },
          onWebEvent: (event) => {
            if (
              !isCurrentStream(stream) ||
              event.request_id !== stream.requestId ||
              event.ai_message_id !== messageIds?.ai
            )
              return
            const web =
              event.type === 'web_warning'
                ? {
                    ...event.web,
                    warnings: [
                      ...(event.web.warnings ?? []).filter(
                        (warning) => warning.code !== event.warning.code,
                      ),
                      event.warning,
                    ],
                  }
                : event.web
            stream.web = web
            streamingWeb.value = web
          },
        },
      )
    })
  }

  function checkStreamingChoices() {
    if (!streamingChoices.value) {
      const { choices } = parseChoices(streamingText.value)
      if (choices) streamingChoices.value = choices
    }
  }

  return {
    resetStreamForNavigation,
    abortChat,
    streamDialogue,
    checkStreamingChoices,
    rememberRequest,
  }
}
