import { nextTick } from 'vue'
import type { Message } from '../../types'
import { deleteMessages } from '../../api/chat'
import { genId } from '../../utils/chat'
import type { WebSnapshot } from '../../types/webSearch'
import { chatErrorMessage } from './errors'
import type { DialogueState } from './useDialogueState'

type Context = Pick<
  DialogueState,
  | 'blockDuringAssessment'
  | 'quotedText'
  | 'saveSessions'
  | 'quotedSource'
  | 'inputBarRef'
  | 'currentSession'
  | 'isThinking'
  | 'chatError'
  | 'retryRequest'
>

export function useDialogueMessages(context: Context) {
  const {
    blockDuringAssessment,
    quotedText,
    saveSessions,
    quotedSource,
    inputBarRef,
    currentSession,
    isThinking,
    chatError,
    retryRequest,
  } = context

  function quoteMessage(msg: Message) {
    if (blockDuringAssessment()) return
    quotedText.value = msg.text
      .replace(/[#*`>]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200)
    if (!msg.db_id && !msg.local_id) {
      msg.local_id = genId()
      saveSessions()
    }
    quotedSource.value = { dbId: msg.db_id, localId: msg.local_id }
    nextTick(() => inputBarRef.value?.focus())
  }

  const deletingMessages = new Set<Message>()

  async function deleteMessage(index: number) {
    const session = currentSession.value
    const message = session?.messages[index]
    if (!session || !message || deletingMessages.has(message)) return
    if (index === 0 && message.role === 'ai' && message.db_id == null) return
    if (isThinking.value) {
      chatError.value = '请先停止当前回复，再删除消息。'
      return
    }
    deletingMessages.add(message)
    chatError.value = ''
    try {
      const ids = [message.db_id, message.paired_db_id].filter((id): id is number => id != null)
      if (ids.length) await deleteMessages(ids)
      const deletedAttachmentIds = new Set(
        message.attachments?.map((attachment) => attachment.id) ?? [],
      )
      if (deletedAttachmentIds.size) {
        for (const item of session.messages) {
          const web = item.metadata?.web as WebSnapshot | undefined
          if (web)
            item.metadata = {
              ...item.metadata,
              web: {
                ...web,
                sources: web.sources.map((source) =>
                  'attachment_id' in source && deletedAttachmentIds.has(source.attachment_id)
                    ? { ...source, deleted: true, excerpt: '' }
                    : source,
                ),
              },
            }
        }
      }
      const currentIndex = session.messages.indexOf(message)
      if (currentIndex >= 0) session.messages.splice(currentIndex, 1)
      retryRequest.value = null
      saveSessions()
    } catch (error) {
      chatError.value = `删除失败：${chatErrorMessage(error)}`
    } finally {
      deletingMessages.delete(message)
    }
  }

  return { quoteMessage, deleteMessage }
}
