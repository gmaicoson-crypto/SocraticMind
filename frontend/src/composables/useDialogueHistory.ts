import type { Ref } from 'vue'
import { getAllMessages } from '../api/chat'
import type { DialogueSession, Message, Topic } from '../types'
import { genId, now, nowDate } from '../utils/chat'

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
  const normalized = session.updatedAt.replace(' ', 'T').replaceAll('/', '-')
  const timestamp = Date.parse(normalized)
  return Number.isNaN(timestamp) ? null : timestamp
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

  function latestTopicSession(topicId: number): DialogueSession | undefined {
    return socraticSessions.value
      .filter((session) => session.topicId === topicId)
      .reduce<DialogueSession | undefined>((latest, candidate) => {
        if (!latest) return candidate
        const latestTime = sessionUpdatedTimestamp(latest)
        const candidateTime = sessionUpdatedTimestamp(candidate)
        if (candidateTime != null && (latestTime == null || candidateTime > latestTime)) {
          return candidate
        }
        if (candidateTime === latestTime) {
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

  function findOrCreateTopicSession(topicId: number): DialogueSession {
    const existing = latestTopicSession(topicId)
    if (existing) return existing

    const topic = topics().find((item) => Number(item.id) === topicId)
    const title = topic?.title ?? '新学习对话'
    const session: DialogueSession = {
      id: genId(),
      name: title.slice(0, 12),
      messages: [
        {
          role: 'ai',
          text: `这是关于「**${title}**」的专属学习对话 ✦\n\n点击右侧知识图谱中的节点开始学习，或继续提问深入这个主题。`,
          time: now(),
        },
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

      const convertMessage = (
        message: (typeof backendMessages)[number],
        parseAiChoices: boolean,
      ): Message | null => {
        if (message.role === 'ai') {
          if (!parseAiChoices) {
            return {
              role: 'ai',
              text: message.content,
              time: message.created_at || now(),
              db_id: message.id,
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
            choices: parsed.choices ?? undefined,
            messageType: message.message_type,
            metadata: message.metadata,
          }
        }
        if (!message.content.trim()) return null
        return {
          role: 'user',
          text: message.content,
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
          const messages = group
            .map((message) => convertMessage(message, mode === 'socratic'))
            .filter((message): message is Message => message != null)
          if (existing) {
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
          messages.sort((a, b) => (a.time || '').localeCompare(b.time || ''))
          if (mode === 'socratic') inferSelectedChoices(messages)
          const topicId = group[0]?.topic_id ?? undefined
          const topic = topics().find((item) => Number(item.id) === topicId)
          return {
            id: sessionId,
            name:
              existing?.name ??
              topic?.title?.slice(0, 12) ??
              (mode === 'normal' ? '历史对话' : '学习对话'),
            messages,
            updatedAt: messages[messages.length - 1]?.time ?? nowDate(),
            topicId: mode === 'socratic' ? topicId : undefined,
            topicTitle: mode === 'socratic' ? (topic?.title ?? existing?.topicTitle) : undefined,
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

  return { findOrCreateTopicSession, rebuildFromBackend }
}
