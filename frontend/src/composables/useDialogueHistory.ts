import type { Ref } from 'vue'
import { getAllMessages } from '../api/chat'
import type { DialogueSession, Message, Topic } from '../types'
import { genId, now, nowDate, parseSessionDate } from '../utils/chat'
import { randomAiAvatar } from '../utils/avatarPresets'
import { createWelcomeMessage, normalizeWelcomeMessages } from './useChatSessions'

interface DialogueHistoryOptions {
  socraticSessions: Ref<DialogueSession[]>
  normalSessions: Ref<DialogueSession[]>
  topics: () => Topic[]
  createDefaultSession: (mode: 'socratic' | 'normal') => DialogueSession
  saveSessions: () => void
  parseChoices: (text: string) => {
    cleanText: string
    choices: { label: string; text: string }[] | null
  }
  inferSelectedChoices: (messages: Message[]) => void
}

function sessionUpdatedTimestamp(session: DialogueSession): number | null {
  const timestamp = parseSessionDate(session.updatedAt)?.getTime()
  if (timestamp == null) return null
  return /^\d{1,2}[/-]/.test(session.updatedAt)
    ? Math.max(timestamp, sessionCreatedTimestamp(session) ?? timestamp)
    : timestamp
}

function sessionCreatedTimestamp(session: DialogueSession): number | null {
  const match = /^s_(\d{13})_/.exec(session.id)
  return match ? Number(match[1]) : null
}

function structuredMessageSignature(message: Message): string | null {
  const runId = message.metadata?.run_id
  if (typeof runId !== 'string') return null
  if (message.messageType === 'agent_answer') {
    const stepId = message.metadata?.step_id
    return typeof stepId === 'string' ? `answer:${runId}:${stepId}` : null
  }
  if (message.messageType === 'agent_step') {
    const version = message.metadata?.version
    return typeof version === 'number' ? `step:${runId}:${version}` : null
  }
  return null
}

function quotedUserContent(content: string, metadata: Record<string, unknown> | null) {
  const savedQuote = typeof metadata?.quote === 'string' ? metadata.quote : null
  const legacyQuote = /^> ([^\n]+)\n\n([\s\S]+)$/.exec(content)
  const quote = savedQuote ?? legacyQuote?.[1]
  const prefix = quote ? `> ${quote}\n\n` : ''
  return {
    text: prefix && content.startsWith(prefix) ? content.slice(prefix.length) : content,
    quote,
    quoteSourceId:
      typeof metadata?.quote_source_id === 'number' ? metadata.quote_source_id : undefined,
  }
}

export function useDialogueHistory(options: DialogueHistoryOptions) {
  const {
    socraticSessions,
    normalSessions,
    topics,
    createDefaultSession,
    saveSessions,
    parseChoices,
    inferSelectedChoices,
  } = options

  function latestTopicSession(
    topicId: number,
    excludeSessionId?: string,
  ): DialogueSession | undefined {
    return socraticSessions.value
      .filter((session) => session.topicId === topicId && session.id !== excludeSessionId)
      .reduce<DialogueSession | undefined>((latest, candidate) => {
        if (!latest) return candidate
        const latestTime = sessionUpdatedTimestamp(latest)
        const candidateTime = sessionUpdatedTimestamp(candidate)
        if (candidateTime != null && (latestTime == null || candidateTime > latestTime)) {
          return candidate
        }
        if (candidateTime === latestTime) {
          const latestCreated = sessionCreatedTimestamp(latest)
          const candidateCreated = sessionCreatedTimestamp(candidate)
          if (latestCreated != null && candidateCreated != null) {
            return candidateCreated > latestCreated ? candidate : latest
          }
          const latestMessageId = Math.max(
            0,
            ...latest.messages.map((message) => message.db_id ?? 0),
          )
          const candidateMessageId = Math.max(
            0,
            ...candidate.messages.map((message) => message.db_id ?? 0),
          )
          if (candidateMessageId > latestMessageId) return candidate
        }
        return latest
      }, undefined)
  }

  function inheritTopicAvatar(session: DialogueSession, topicId: number, fallbackUrl: string) {
    if (session.aiAvatarSelected) return
    const previous = latestTopicSession(topicId, session.id)
    if (previous) session.aiAvatarUrl = previous.aiAvatarUrl ?? fallbackUrl
  }

  function findOrCreateTopicSession(topicId: number): DialogueSession {
    const existing = latestTopicSession(topicId)
    if (existing) return existing

    const topic = topics().find((item) => Number(item.id) === topicId)
    const title = topic?.title ?? '新学习对话'
    const session: DialogueSession = {
      id: genId(),
      name: '新对话',
      aiAvatarUrl: randomAiAvatar('socratic'),
      messages: [
        createWelcomeMessage(
          'socratic',
          `这是关于「**${title}**」的专属学习对话 ✦\n\n点击右侧知识图谱中的节点开始学习，或继续提问深入这个主题。`,
        ),
      ],
      updatedAt: nowDate(),
      topicId,
      topicTitle: topic?.title,
    }
    socraticSessions.value = [session, ...socraticSessions.value]
    return session
  }

  async function rebuildFromBackend() {
    try {
      const backendMessages = await getAllMessages(500, 0)
      if (!backendMessages.length) return
      const messagesById = new Map(backendMessages.map((message) => [message.id, message]))
      const chatRequestFor = (
        message: (typeof backendMessages)[number],
      ): Message['chatRequest'] => {
        const userId = message.metadata?.user_message_id
        const user = typeof userId === 'number' ? messagesById.get(userId) : undefined
        if (!user || user.role !== 'user' || user.session_id !== message.session_id)
          return undefined
        const kind = message.metadata?.kind
        return {
          nodeKey: message.node_key,
          input: user.content,
          kind: kind === 'topic_overview' || kind === 'node_overview' ? kind : 'qa',
          userMessageId: user.id,
          attachmentIds: user.attachments?.map((attachment) => attachment.id),
        }
      }

      const convertMessage = (
        message: (typeof backendMessages)[number],
        parseAiChoices: boolean,
      ): Message | null => {
        if (message.role === 'ai') {
          const chatRequest = chatRequestFor(message)
          const pairedMessageId =
            chatRequest && chatRequest.kind !== 'qa' ? chatRequest.userMessageId : undefined
          if (!parseAiChoices) {
            return {
              role: 'ai',
              text: message.content,
              time: message.created_at || now(),
              db_id: message.id,
              chatRequest,
              paired_db_id: pairedMessageId,
              messageType: message.message_type,
              metadata: message.metadata,
            }
          }
          const parsed = parseChoices(message.content)
          return {
            role: 'ai',
            text: parsed.cleanText,
            time: message.created_at || now(),
            db_id: message.id,
            chatRequest,
            paired_db_id: pairedMessageId,
            choices: parsed.choices ?? undefined,
            messageType: message.message_type,
            metadata: message.metadata,
          }
        }
        if (!message.content.trim() && !message.attachments?.length) return null
        const quoted = quotedUserContent(message.content, message.metadata)
        return {
          role: 'user',
          attachments: message.attachments,
          text: quoted.text,
          quote: quoted.quote ?? undefined,
          quote_source_db_id: quoted.quoteSourceId,
          time: message.created_at || now(),
          db_id: message.id,
          messageType: message.message_type,
          metadata: message.metadata,
        }
      }

      const rebuildMode = (mode: 'socratic' | 'normal', localSessions: DialogueSession[]) => {
        const groups = new Map<string, typeof backendMessages>()
        for (const message of backendMessages.filter((item) =>
          mode === 'socratic' ? item.mode === 'socratic' : item.mode !== 'socratic',
        )) {
          const group = groups.get(message.session_id) ?? []
          group.push(message)
          groups.set(message.session_id, group)
        }

        const rebuilt: DialogueSession[] = [...groups.entries()].map(([sessionId, group]) => {
          const existing = localSessions.find((session) => session.id === sessionId)
          let messages = group
            .map((message) => convertMessage(message, mode === 'socratic'))
            .filter((message): message is Message => message != null)
          if (existing) {
            const localByDbId = new Map(
              existing.messages
                .filter((message) => message.db_id != null)
                .map((message) => [message.db_id, message] as const),
            )
            for (const message of messages) {
              const local = localByDbId.get(message.db_id)
              if (!local) continue
              message.local_id = local.local_id
              message.chatRequest ??= local.chatRequest
              message.quote ??= local.quote
              message.quote_source_db_id ??= local.quote_source_db_id
              message.quote_source_local_id = local.quote_source_local_id
            }
            const persistedStructured = new Set(
              messages
                .map(structuredMessageSignature)
                .filter((value): value is string => value != null),
            )
            messages.push(
              ...existing.messages.filter((message) => {
                if (message.db_id != null) return false
                const signature = structuredMessageSignature(message)
                return !signature || !persistedStructured.has(signature)
              }),
            )
          }
          messages.sort((a, b) => {
            const timeOrder = (a.time || '').localeCompare(b.time || '')
            if (timeOrder !== 0) return timeOrder
            if (a.db_id == null) return b.db_id == null ? 0 : 1
            if (b.db_id == null) return -1
            return a.db_id - b.db_id
          })
          messages = normalizeWelcomeMessages(messages)
          if (mode === 'socratic') inferSelectedChoices(messages)
          const topicId = group[0]?.topic_id ?? undefined
          const topic = topics().find((item) => Number(item.id) === topicId)
          const latestChat = group.reduce<(typeof group)[number] | undefined>(
            (latest, message) =>
              message.message_type === 'chat' && (!latest || message.id > latest.id)
                ? message
                : latest,
            undefined,
          )
          return {
            id: sessionId,
            aiAvatarUrl: existing?.aiAvatarUrl ?? randomAiAvatar(mode),
            aiAvatarSelected: existing?.aiAvatarSelected,
            name: existing?.name ?? '新对话',
            messages,
            updatedAt: messages[messages.length - 1]?.time ?? nowDate(),
            topicId: mode === 'socratic' ? topicId : undefined,
            topicTitle: mode === 'socratic' ? (topic?.title ?? existing?.topicTitle) : undefined,
            nodeKey:
              mode === 'socratic'
                ? latestChat
                  ? latestChat.metadata?.kind === 'topic_overview'
                    ? null
                    : latestChat.node_key
                  : existing?.nodeKey
                : undefined,
          }
        })

        for (const session of localSessions) {
          const isLocalOnly = session.messages.every((message) => message.db_id == null)
          if (isLocalOnly && !rebuilt.some((item) => item.id === session.id)) rebuilt.push(session)
        }
        return rebuilt.length ? rebuilt : [createDefaultSession(mode)]
      }

      socraticSessions.value = rebuildMode('socratic', socraticSessions.value)
      normalSessions.value = rebuildMode('normal', normalSessions.value)
      saveSessions()
    } catch (error) {
      console.warn('从数据库加载历史消息失败', error)
    }
  }

  return { findOrCreateTopicSession, inheritTopicAvatar, rebuildFromBackend }
}
