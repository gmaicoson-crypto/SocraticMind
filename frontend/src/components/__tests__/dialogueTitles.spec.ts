import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { getAllMessages, chatStream } from '../../api/chat'
import { getSessionTitles, renameSessionTitle, requestSessionTitle } from '../../api/sessionTitles'
import { createDefaultSession } from '../../composables/useChatSessions'
import { useLearningStore } from '../../stores/learning'
import { useUserStore } from '../../stores/user'
import type { ChatMode } from '../../types'
import type { KNode } from '../../types'
import { attachmentCapabilities } from '../../test/fixtures/attachments'
import SocraticDialogue from '../SocraticDialogue.vue'
import DialogueInputBar from '../dialogue/DialogueInputBar.vue'
import DialogueHistoryPanel from '../dialogue/DialogueHistoryPanel.vue'

vi.mock('../../api/chat', () => ({
  getAllMessages: vi.fn().mockResolvedValue([]),
  getSuggestions: vi.fn().mockResolvedValue([]),
  chatStream: vi.fn(),
  cancelChatStream: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../api/sessionTitles', () => ({
  getSessionTitles: vi.fn().mockResolvedValue([]),
  requestSessionTitle: vi.fn(),
  renameSessionTitle: vi.fn(),
}))
vi.mock('../../api/attachments', () => ({
  getAttachmentCapabilities: vi.fn().mockResolvedValue(attachmentCapabilities),
}))
vi.mock('../../api/models', () => ({ getLLMModels: vi.fn().mockResolvedValue([]) }))
vi.mock('../../api/progress', () => ({
  recordToday: vi.fn().mockResolvedValue(undefined),
  getStreak: vi.fn().mockResolvedValue({ streak: 0, total_days: 0, recent: [] }),
}))

const wrappers: ReturnType<typeof shallowMount>[] = []
async function mountDialogue(mode: ChatMode) {
  const wrapper = shallowMount(SocraticDialogue, {
    global: { stubs: { MessageList: false, DialogueInputBar: false } },
  })
  wrappers.push(wrapper)
  if (mode === 'normal') wrapper.findComponent(DialogueInputBar).vm.$emit('update:chatMode', mode)
  await flushPromises()
  return wrapper
}

describe('AI titles in learning and normal conversations', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.mocked(getAllMessages).mockResolvedValue([])
    vi.mocked(getSessionTitles).mockResolvedValue([])
    setActivePinia(createPinia())
    useUserStore().setUserInfo({
      id: 1,
      username: 'test',
      email: '',
      avatar_url: '',
      ai_avatar_url: '',
      bio: '',
      daily_goal: 30,
      ai_style: '标准',
    })
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    })
  })
  afterEach(() => {
    for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  })

  it.each(['socratic', 'normal'] as const)(
    'starts a %s session with 新对话 and summarizes after the user sends',
    async (mode) => {
      vi.mocked(requestSessionTitle).mockImplementation(async (id) => ({
        session_id: id,
        title: '递归终止条件',
        status: 'ready',
        retry_pending: false,
      }))
      const wrapper = await mountDialogue(mode)
      expect(wrapper.get('.dlg-title').text()).toBe('新对话')
      expect(requestSessionTitle).not.toHaveBeenCalled()
      const input = wrapper.findComponent(DialogueInputBar)
      input.vm.$emit('update:input', '为什么递归需要终止条件？')
      input.vm.$emit('send')
      await flushPromises()
      expect(requestSessionTitle).toHaveBeenCalledTimes(1)
      expect(vi.mocked(requestSessionTitle).mock.calls[0][1]).toBe(mode)
      expect(wrapper.get('.dlg-title').text()).toBe('递归终止条件')
      if (mode === 'normal') expect(chatStream).toHaveBeenCalled()
      window.dispatchEvent(new Event('pagehide'))
      const saved = JSON.parse(localStorage.getItem(`sm_${mode}_sessions`)!)
      expect(saved[0]).not.toHaveProperty('name')
    },
  )

  it('keeps a server title when a learning topic changes and saves manual renames remotely', async () => {
    const session = createDefaultSession('socratic')
    session.topicId = 1
    session.topicTitle = '旧主题'
    session.messages.push({ role: 'user', text: '我的问题', time: '10:00' })
    localStorage.setItem('sm_socratic_sessions', JSON.stringify([session]))
    localStorage.setItem('sm_socratic_cur', session.id)
    const learning = useLearningStore()
    learning.topics = [{ id: '1', title: '旧主题', emoji: '', nodes: 0, mastered: 0 }]
    learning.activeTopicId = '1'
    vi.mocked(getSessionTitles).mockResolvedValue([
      { session_id: session.id, title: 'AI总结标题', status: 'ready', retry_pending: false },
    ])
    const wrapper = await mountDialogue('socratic')
    expect(wrapper.get('.dlg-title').text()).toBe('AI总结标题')
    learning.topics = [{ ...learning.topics[0], title: '修改后的主题' }]
    await flushPromises()
    expect(wrapper.get('.dlg-title').text()).toBe('AI总结标题')
    vi.mocked(renameSessionTitle).mockResolvedValue({
      session_id: session.id,
      title: '手动笔记',
      status: 'manual',
      retry_pending: false,
    })
    const history = wrapper.findComponent(DialogueHistoryPanel)
    history.vm.$emit('startEdit', history.props('sessions')[0])
    history.vm.$emit('update:editingName', '手动笔记')
    history.vm.$emit('saveName', session.id)
    await flushPromises()
    expect(renameSessionTitle).toHaveBeenCalledWith(session.id, '手动笔记')
    expect(wrapper.get('.dlg-title').text()).toBe('手动笔记')
    window.dispatchEvent(new Event('pagehide'))
    expect(JSON.parse(localStorage.getItem('sm_socratic_sessions')!)[0]).not.toHaveProperty('name')
  })

  it('shows the session node above the AI summary and restores each node when switching history', async () => {
    const nodes: KNode[] = [
      { id: 'tools', label: '工具调用', sub: '', x: 0, y: 0, state: 'available' },
      { id: 'text', label: '普通文本回答', sub: '', x: 0, y: 0, state: 'available' },
    ]
    const sessions = nodes.map((node) => {
      const session = createDefaultSession('socratic')
      session.topicId = 1
      session.nodeKey = node.id
      session.messages.push({ role: 'user', text: '两种回答的区别', time: '10:00' })
      return session
    })
    localStorage.setItem('sm_socratic_sessions', JSON.stringify(sessions))
    localStorage.setItem('sm_socratic_cur', sessions[0].id)
    const learning = useLearningStore()
    learning.topics = [{ id: '1', title: 'AI基础', emoji: '', nodes: 2, mastered: 0 }]
    learning.activeTopicId = '1'
    learning.nodes = nodes
    learning.activeNode = nodes[1]
    vi.mocked(getSessionTitles).mockResolvedValue(
      sessions.map((session, index) => ({
        session_id: session.id,
        title: index === 0 ? '工具调用与普通文本回答的区别' : '普通文本回答的表达方式',
        status: 'ready' as const,
        retry_pending: false,
      })),
    )
    const wrapper = await mountDialogue('socratic')
    expect(wrapper.get('.dlg-title').text()).toBe('工具调用')
    expect(wrapper.get('.dlg-sub').text()).toBe('工具调用与普通文本回答的区别')
    expect(learning.activeNode?.id).toBe('tools')
    const history = wrapper.findComponent(DialogueHistoryPanel)
    expect(history.props('sessions')[0].name).toBe('工具调用与普通文本回答的区别')
    history.vm.$emit('switch', sessions[1].id)
    await flushPromises()
    expect(wrapper.get('.dlg-title').text()).toBe('普通文本回答')
    expect(wrapper.get('.dlg-sub').text()).toBe('普通文本回答的表达方式')
    expect(learning.activeNode?.id).toBe('text')
    await wrapper.get('[title="新建对话"]').trigger('click')
    expect(wrapper.get('.dlg-title').text()).toBe('新对话')
  })

  it('keeps the AI subtitle visible while a node reply streams and recovers node names from old request records', async () => {
    const session = createDefaultSession('socratic')
    session.topicId = 1
    session.messages.push(
      { role: 'user', text: '工具调用的作用', time: '10:00' },
      {
        role: 'ai',
        text: '历史回答',
        time: '10:01',
        chatRequest: { nodeKey: 'tools', input: '工具调用的作用', kind: 'qa' },
      },
    )
    localStorage.setItem('sm_socratic_sessions', JSON.stringify([session]))
    const learning = useLearningStore()
    learning.topics = [{ id: '1', title: 'AI基础', emoji: '', nodes: 1, mastered: 0 }]
    learning.activeTopicId = '1'
    learning.nodes = [{ id: 'tools', label: '工具调用', sub: '', x: 0, y: 0, state: 'available' }]
    vi.mocked(getSessionTitles).mockResolvedValue([
      { session_id: session.id, title: '工具调用的作用', status: 'ready', retry_pending: false },
    ])
    const wrapper = await mountDialogue('socratic')
    expect(wrapper.get('.dlg-title').text()).toBe('工具调用')
    const input = wrapper.findComponent(DialogueInputBar)
    input.vm.$emit('update:input', '进一步解释')
    input.vm.$emit('send')
    await flushPromises()
    expect(wrapper.get('.dlg-title').text()).toBe('工具调用')
    expect(wrapper.get('.dlg-sub').text()).toBe('工具调用的作用')
    expect(wrapper.get('.dlg-status').text()).toBe('正在思考…')
    expect(vi.mocked(chatStream).mock.calls.at(-1)?.[0].nodeKey).toBe('tools')
    input.vm.$emit('update:chatMode', 'normal')
    await flushPromises()
    expect(wrapper.get('.dlg-title').text()).toBe('新对话')
  })
})
