import { onScopeDispose, watch } from 'vue'
import { getSessionTitles, renameSessionTitle, requestSessionTitle } from '../api/sessionTitles'
import type { SessionTitleState } from '../api/sessionTitles'
import type { ChatMode, DialogueSession } from '../types'

interface SessionTitlesOptions {
  sessions: () => DialogueSession[]
  mode: (session: DialogueSession) => ChatMode
  userId: () => number | undefined
}

function firstUserMessage(session: DialogueSession) {
  return session.messages.find(
    (message) =>
      message.role === 'user' &&
      (!message.metadata?.kind || message.metadata.kind === 'qa') &&
      (message.text.trim() || message.attachments?.length),
  )
}

export function useSessionTitles(options: SessionTitlesOptions) {
  const titles = new Map<string, SessionTitleState>()
  const requests = new Map<string, Promise<SessionTitleState | undefined>>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  let epoch = 0

  function apply(state: SessionTitleState) {
    const previous = titles.get(state.session_id)
    if (previous?.status === 'manual' && state.status !== 'manual') return
    if ((previous?.status === 'ready' || previous?.status === 'manual') && !state.title) return
    titles.set(state.session_id, state)
    const session = options.sessions().find((item) => item.id === state.session_id)
    if (session) session.name = firstUserMessage(session) ? (state.title ?? '新对话') : '新对话'
  }

  function pendingIds() {
    return options
      .sessions()
      .filter((session) => {
        const state = titles.get(session.id)
        return (
          firstUserMessage(session) &&
          (state?.status === 'pending' || state?.status === 'running' || state?.retry_pending)
        )
      })
      .map((session) => session.id)
  }

  function schedulePoll() {
    if (disposed || timer || !pendingIds().length) return
    timer = setTimeout(() => {
      timer = undefined
      void poll()
    }, 2000)
  }

  async function poll() {
    const currentEpoch = epoch
    try {
      const states = await getSessionTitles(pendingIds())
      if (disposed || currentEpoch !== epoch) return
      for (const state of states) apply(state)
    } catch (error) {
      console.warn('加载对话标题失败', error)
    }
    if (currentEpoch === epoch) schedulePoll()
  }

  async function ensureTitle(session: DialogueSession): Promise<SessionTitleState | undefined> {
    const message = firstUserMessage(session)
    if (
      disposed ||
      !options.userId() ||
      !message ||
      session.awaitingTopicChoice ||
      !options.sessions().some((item) => item.id === session.id)
    )
      return
    const existing = titles.get(session.id)
    if (existing) {
      apply(existing)
      schedulePoll()
      return existing
    }
    const pending = requests.get(session.id)
    if (pending) return pending
    const currentEpoch = epoch
    const request = requestSessionTitle(session.id, options.mode(session), message)
      .then((state) => {
        if (!disposed && currentEpoch === epoch) {
          apply(state)
          schedulePoll()
        }
        return state
      })
      .catch((error) => {
        console.warn('生成对话标题失败', error)
        return undefined
      })
      .finally(() => {
        if (currentEpoch === epoch) requests.delete(session.id)
      })
    requests.set(session.id, request)
    return request
  }

  async function refreshTitles() {
    if (disposed || !options.userId()) return
    const currentEpoch = epoch
    const sessions = options.sessions().filter((session) => firstUserMessage(session))
    try {
      const states = await getSessionTitles(sessions.map((session) => session.id))
      if (disposed || currentEpoch !== epoch) return
      for (const state of states) apply(state)
      // Existing conversations without server titles are summarized from their first user message.
      for (const session of sessions) await ensureTitle(session)
      schedulePoll()
    } catch (error) {
      console.warn('加载对话标题失败', error)
    }
  }

  async function renameTitle(session: DialogueSession, title: string) {
    const currentEpoch = epoch
    const state = await ensureTitle(session)
    if (!state || disposed || currentEpoch !== epoch)
      throw new Error('标题暂时无法保存，请稍后重试')
    const renamed = await renameSessionTitle(session.id, title.trim())
    if (!disposed && currentEpoch === epoch) apply(renamed)
  }

  watch(options.userId, () => {
    epoch += 1
    clearTimeout(timer)
    timer = undefined
    titles.clear()
    requests.clear()
    for (const session of options.sessions()) session.name = '新对话'
  })

  onScopeDispose(() => {
    disposed = true
    epoch += 1
    clearTimeout(timer)
  })

  return { ensureTitle, refreshTitles, renameTitle }
}
