import { ref } from 'vue'
import type { ChatMode, DialogueSession, Message } from '../types'
import { genId, now, nowDate } from '../utils/chat'
import { normalizeAiAvatarUrl, randomAiAvatar } from '../utils/avatarPresets'

//本地存储的 key
const STORAGE_KEYS = {
  socratic: 'sm_socratic_sessions',
  normal: 'sm_normal_sessions',
  socraticCurrent: 'sm_socratic_cur',
  normalCurrent: 'sm_normal_cur',
} as const

export const SOCRATIC_WELCOME_TEXT =
  '你好！我是 Socrates，你的 AI 学习导师 ✦\n\n告诉我你想学什么，我来为你生成专属知识图谱，然后引导你一步步掌握它。'
const NORMAL_WELCOME_TEXT =
  '你好！我是你的 AI 助手 💬\n\n有任何问题都可以直接问我，我会直接给出答案。'

export function createWelcomeMessage(mode: ChatMode, text?: string): Message {
  return {
    role: 'ai',
    text: text ?? (mode === 'socratic' ? SOCRATIC_WELCOME_TEXT : NORMAL_WELCOME_TEXT),
    time: now(),
    metadata: { is_welcome: true },
  }
}

export function isWelcomeMessage(message: Message): boolean {
  if (
    message.role !== 'ai' ||
    message.db_id != null ||
    message.chatRequest ||
    (message.messageType && message.messageType !== 'chat')
  )
    return false
  // Older caches have no marker and may have sorted the opening after saved replies.
  return (
    message.metadata?.is_welcome === true ||
    message.text === SOCRATIC_WELCOME_TEXT ||
    message.text === NORMAL_WELCOME_TEXT ||
    /^这是关于「\*\*[\s\S]+\*\*」的专属学习对话 ✦\n\n点击右侧知识图谱中的节点开始学习，或继续提问深入这个主题。$/.test(
      message.text,
    ) ||
    /^你刚才学习的是「\*\*[\s\S]+\*\*」。这个新对话要继续该主题，还是创建一个全新的学习主题呢？$/.test(
      message.text,
    )
  )
}

export function normalizeWelcomeMessages(messages: Message[]): Message[] {
  let welcome: Message | undefined
  const conversation = messages.filter((message) => {
    if (!isWelcomeMessage(message)) return true
    welcome ??= message
    return false
  })
  if (!welcome || (messages[0] === welcome && conversation.length === messages.length - 1))
    return messages
  return [welcome, ...conversation]
}

//创建默认会话
export function createDefaultSession(mode: ChatMode): DialogueSession {
  return {
    id: genId(),
    name: '新对话',
    aiAvatarUrl: randomAiAvatar(mode),
    messages: [createWelcomeMessage(mode)],
    updatedAt: nowDate(),
  }
}

function serializeSessions(sessions: DialogueSession[]): string {
  return JSON.stringify(sessions.map(({ name: _name, ...session }) => session))
}

function loadSessions(key: string, mode: ChatMode): DialogueSession[] {
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const sessions = JSON.parse(raw) as DialogueSession[]
      if (Array.isArray(sessions) && sessions.length > 0) {
        let migrated = false
        for (const session of sessions) {
          // Titles belong to the server; discard legacy names before displaying the cache.
          if ('name' in session) migrated = true
          session.name = '新对话'
          const messages = normalizeWelcomeMessages(session.messages)
          if (messages !== session.messages) {
            session.messages = messages
            migrated = true
          }
          if (session.aiAvatarUrl) {
            const normalized = normalizeAiAvatarUrl(session.aiAvatarUrl)
            const nextUrl =
              mode === 'normal' && !session.aiAvatarSelected && normalized.includes('/AI/study/')
                ? randomAiAvatar('normal')
                : normalized
            if (nextUrl !== session.aiAvatarUrl) {
              session.aiAvatarUrl = nextUrl
              migrated = true
            }
          }
        }
        if (migrated) {
          try {
            localStorage.setItem(key, serializeSessions(sessions))
          } catch (error) {
            console.warn(`本地会话 ${key} 迁移保存失败`, error)
          }
        }
        return sessions
      }
    }
  } catch (err) {
    console.warn(`本地会话 ${key} 解析失败，回退到默认会话`, err)
  }
  return [createDefaultSession(mode)]
}

function loadCurrentId(key: string, sessions: DialogueSession[]): string {
  try {
    const id = localStorage.getItem(key)
    if (id && sessions.some((session) => session.id === id)) return id
  } catch (err) {
    console.warn(`本地当前会话 id 读取失败，回退到首个会话`, err)
  }
  return sessions[0].id
}

export function useChatSessions() {
  const socraticSessions = ref(loadSessions(STORAGE_KEYS.socratic, 'socratic'))
  const normalSessions = ref(loadSessions(STORAGE_KEYS.normal, 'normal'))
  const socraticCurrentId = ref(loadCurrentId(STORAGE_KEYS.socraticCurrent, socraticSessions.value))
  const normalCurrentId = ref(loadCurrentId(STORAGE_KEYS.normalCurrent, normalSessions.value))
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  function persistSessions() {
    localStorage.setItem(STORAGE_KEYS.socratic, serializeSessions(socraticSessions.value))
    localStorage.setItem(STORAGE_KEYS.normal, serializeSessions(normalSessions.value))
    localStorage.setItem(STORAGE_KEYS.socraticCurrent, socraticCurrentId.value)
    localStorage.setItem(STORAGE_KEYS.normalCurrent, normalCurrentId.value)
  }

  function saveSessions(immediate = false) {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = null
    if (immediate) persistSessions()
    else saveTimer = setTimeout(persistSessions, 300)
  }

  function disposeSessionPersistence() {
    if (saveTimer) saveSessions(true)
  }

  return {
    socraticSessions,
    normalSessions,
    socraticCurrentId,
    normalCurrentId,
    createDefaultSession,
    saveSessions,
    disposeSessionPersistence,
  }
}
