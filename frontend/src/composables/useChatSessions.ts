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

export function createWelcomeMessage(mode: ChatMode): Message {
  return {
    role: 'ai',
    text:
      mode === 'socratic'
        ? SOCRATIC_WELCOME_TEXT
        : '你好！我是你的 AI 助手 💬\n\n有任何问题都可以直接问我，我会直接给出答案。',
    time: now(),
  }
}

//创建默认会话
export function createDefaultSession(mode: ChatMode): DialogueSession {
  return {
    id: genId(),
    name: mode === 'socratic' ? '新学习对话' : '新普通对话',
    aiAvatarUrl: randomAiAvatar(mode),
    messages: [createWelcomeMessage(mode)],
    updatedAt: nowDate(),
  }
}

function loadSessions(key: string, mode: ChatMode): DialogueSession[] {
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const sessions = JSON.parse(raw) as DialogueSession[]
      if (Array.isArray(sessions) && sessions.length > 0) {
        let migrated = false
        for (const session of sessions) {
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
            localStorage.setItem(key, JSON.stringify(sessions))
          } catch (error) {
            console.warn(`本地会话 ${key} 头像迁移保存失败`, error)
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
    localStorage.setItem(STORAGE_KEYS.socratic, JSON.stringify(socraticSessions.value))
    localStorage.setItem(STORAGE_KEYS.normal, JSON.stringify(normalSessions.value))
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
    if (saveTimer) clearTimeout(saveTimer)
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
