import { effectScope, nextTick, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSessionTitles, renameSessionTitle, requestSessionTitle } from '../../api/sessionTitles'
import type { SessionTitleState } from '../../api/sessionTitles'
import { attachment } from '../../test/fixtures/attachments'
import type { ChatMode } from '../../types'
import { createDefaultSession, useChatSessions } from '../useChatSessions'
import { useSessionTitles } from '../useSessionTitles'

vi.mock('../../api/sessionTitles', () => ({
  getSessionTitles: vi.fn().mockResolvedValue([]),
  requestSessionTitle: vi.fn(),
  renameSessionTitle: vi.fn(),
}))

const scopes: ReturnType<typeof effectScope>[] = []
function setup(mode: ChatMode = 'normal') {
  const scope = effectScope()
  scopes.push(scope)
  const sessions = useChatSessions()
  const session = (mode === 'normal' ? sessions.normalSessions : sessions.socraticSessions).value[0]
  const userId = ref<number | undefined>(1)
  const titles = scope.run(() =>
    useSessionTitles({
      sessions: () => [...sessions.socraticSessions.value, ...sessions.normalSessions.value],
      mode: () => mode,
      userId: () => userId.value,
    }),
  )!
  return { ...sessions, session, titles, scope, userId }
}

function state(
  sessionId: string,
  status: SessionTitleState['status'] = 'pending',
  title: string | null = null,
): SessionTitleState {
  return { session_id: sessionId, title, status, retry_pending: false }
}

describe('server-owned session titles', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetAllMocks()
    vi.mocked(getSessionTitles).mockResolvedValue([])
    vi.useFakeTimers()
  })
  afterEach(() => {
    for (const scope of scopes.splice(0)) scope.stop()
    vi.useRealTimers()
  })

  it.each(['socratic', 'normal'] as const)(
    'keeps an empty %s session as 新对话 even when it has a topic',
    async (mode) => {
      const { session, titles } = setup(mode)
      session.topicId = 1
      session.topicTitle = '线性代数'
      await titles.ensureTitle(session)
      await titles.refreshTitles()
      expect(session.name).toBe('新对话')
      expect(requestSessionTitle).not.toHaveBeenCalled()
      expect(getSessionTitles).toHaveBeenCalledWith([])
    },
  )

  it.each(['socratic', 'normal'] as const)(
    'summarizes the first %s user message once and fetches the result',
    async (mode) => {
      const { session, titles } = setup(mode)
      const message = { role: 'user' as const, text: '为什么递归需要终止条件？', time: '10:00' }
      session.messages.push(message)
      vi.mocked(requestSessionTitle).mockResolvedValue(state(session.id))
      await Promise.all([titles.ensureTitle(session), titles.ensureTitle(session)])
      expect(requestSessionTitle).toHaveBeenCalledTimes(1)
      expect(requestSessionTitle).toHaveBeenCalledWith(session.id, mode, message)
      vi.mocked(getSessionTitles).mockResolvedValue([state(session.id, 'ready', '递归终止条件')])
      await vi.advanceTimersByTimeAsync(2000)
      expect(session.name).toBe('递归终止条件')
      const calls = vi.mocked(getSessionTitles).mock.calls.length
      await vi.advanceTimersByTimeAsync(10_000)
      expect(getSessionTitles).toHaveBeenCalledTimes(calls)
      session.messages.push({ ...message, text: '后续问题' })
      await titles.ensureTitle(session)
      expect(requestSessionTitle).toHaveBeenCalledTimes(1)
    },
  )

  it('generates from an attachment-only user send and ignores automatic overview requests', async () => {
    const { session, titles } = setup()
    session.messages.push({
      role: 'user',
      text: '自动介绍',
      time: '10:00',
      metadata: { kind: 'node_overview' },
    })
    await titles.ensureTitle(session)
    expect(requestSessionTitle).not.toHaveBeenCalled()
    const message = { role: 'user' as const, text: '', time: '10:01', attachments: [attachment()] }
    session.messages.push(message)
    vi.mocked(requestSessionTitle).mockResolvedValue(state(session.id, 'ready', '资料讨论'))
    await titles.ensureTitle(session)
    expect(requestSessionTitle).toHaveBeenCalledWith(session.id, 'normal', message)
    expect(session.name).toBe('资料讨论')
  })

  it('drops legacy names, never caches new titles, and restores the title from the server', async () => {
    const legacy = createDefaultSession('normal')
    legacy.name = '旧的本地名称'
    legacy.messages.push({ role: 'user', text: '历史问题', time: '10:00', db_id: 1 })
    localStorage.setItem('sm_normal_sessions', JSON.stringify([legacy]))
    const sessions = setup()
    expect(sessions.session.name).toBe('新对话')
    expect(JSON.parse(localStorage.getItem('sm_normal_sessions')!)[0]).not.toHaveProperty('name')
    vi.mocked(getSessionTitles).mockResolvedValue([state(legacy.id, 'ready', '服务端标题')])
    await sessions.titles.refreshTitles()
    expect(sessions.session.name).toBe('服务端标题')
    expect(requestSessionTitle).not.toHaveBeenCalled()
    sessions.saveSessions(true)
    expect(localStorage.getItem('sm_normal_sessions')).not.toContain('服务端标题')
    expect(useChatSessions().normalSessions.value[0].name).toBe('新对话')
  })

  it('backfills a restored conversation without a server title', async () => {
    const { session, titles } = setup('socratic')
    session.messages.push({ role: 'user', text: '历史问题', time: '10:00', db_id: 1 })
    vi.mocked(requestSessionTitle).mockResolvedValue(state(session.id, 'ready', '历史讨论'))
    await titles.refreshTitles()
    expect(session.name).toBe('历史讨论')
    expect(requestSessionTitle).toHaveBeenCalledTimes(1)
  })

  it('saves manual titles remotely and ignores a late AI poll response', async () => {
    const { session, titles } = setup()
    session.messages.push({ role: 'user', text: '问题', time: '10:00' })
    vi.mocked(requestSessionTitle).mockResolvedValue(state(session.id))
    await titles.ensureTitle(session)
    let resolvePoll!: (states: SessionTitleState[]) => void
    vi.mocked(getSessionTitles).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePoll = resolve
        }),
    )
    await vi.advanceTimersByTimeAsync(2000)
    vi.mocked(renameSessionTitle).mockResolvedValue(state(session.id, 'manual', '我的笔记'))
    await titles.renameTitle(session, ' 我的笔记 ')
    resolvePoll([state(session.id, 'ready', '迟到的标题')])
    await flushPromises()
    expect(renameSessionTitle).toHaveBeenCalledWith(session.id, '我的笔记')
    expect(session.name).toBe('我的笔记')
  })

  it('discards requests after account changes and stops polling after unmount', async () => {
    const { session, titles, scope, userId } = setup()
    session.messages.push({ role: 'user', text: '问题', time: '10:00' })
    let finish!: (value: SessionTitleState) => void
    vi.mocked(requestSessionTitle).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const request = titles.ensureTitle(session)
    userId.value = 2
    await nextTick()
    finish(state(session.id, 'ready', '上个账号标题'))
    await request
    expect(session.name).toBe('新对话')
    vi.mocked(requestSessionTitle).mockResolvedValue(state(session.id))
    await titles.ensureTitle(session)
    scope.stop()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(getSessionTitles).not.toHaveBeenCalled()
  })
})
