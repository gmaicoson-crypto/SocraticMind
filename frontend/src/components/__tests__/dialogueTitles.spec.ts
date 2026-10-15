import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { getAllMessages, chatStream, deleteChatSession } from '../../api/chat'
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
  deleteChatSession: vi.fn(),
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
    global: {
      stubs: {
        MessageList: false,
        DialogueHeader: false,
        DialogueInputBar: false,
        DialogueHistoryPanel: false,
        ConfirmDialog: false,
        BaseModal: false,
        BaseButton: false,
        IconButton: false,
        teleport: true,
      },
    },
  })
  wrappers.push(wrapper)
  if (mode === 'normal') wrapper.findComponent(DialogueInputBar).vm.$emit('update:chatMode', mode)
  await flushPromises()
  return wrapper
}

function seedHistory(mode: ChatMode, count = 2) {
  const sessions = Array.from({ length: count }, (_, index) => {
    const session = createDefaultSession(mode)
    session.messages.push({ role: 'user', text: `问题 ${index + 1}`, time: '10:00' })
    return session
  })
  localStorage.setItem(`sm_${mode}_sessions`, JSON.stringify(sessions))
  localStorage.setItem(`sm_${mode}_cur`, sessions[0].id)
  vi.mocked(getSessionTitles).mockResolvedValue(
    sessions.map((session, index) => ({
      session_id: session.id,
      title: `历史对话 ${index + 1}`,
      status: 'ready',
      retry_pending: false,
    })),
  )
  return sessions
}

describe('AI titles in learning and normal conversations', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.mocked(getAllMessages).mockResolvedValue([])
    vi.mocked(getSessionTitles).mockResolvedValue([])
    vi.mocked(deleteChatSession).mockReset().mockResolvedValue(1)
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
      expect(wrapper.get('[aria-label="编辑对话名称"]').attributes('disabled')).toBeDefined()
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
    await flushPromises()
    await wrapper.get('.session-name-field input').setValue('手动笔记')
    await wrapper.get('[role="alertdialog"] .primary').trigger('click')
    await flushPromises()
    expect(renameSessionTitle).toHaveBeenCalledWith(session.id, '手动笔记')
    expect(wrapper.get('.dlg-title').text()).toBe('手动笔记')
    window.dispatchEvent(new Event('pagehide'))
    expect(JSON.parse(localStorage.getItem('sm_socratic_sessions')!)[0]).not.toHaveProperty('name')
  })

  it.each(['socratic', 'normal'] as const)(
    'edits another %s history entry in a dialog and cancels without changing the session',
    async (mode) => {
      const sessions = seedHistory(mode)
      const wrapper = await mountDialogue(mode)
      await wrapper.get('[title="对话历史"]').trigger('click')
      const history = wrapper.findComponent(DialogueHistoryPanel)
      const rename = history.get(`[data-session-id="${sessions[1].id}"] [title="重命名"]`)
      await rename.trigger('click')
      const dialog = wrapper.get('[role="alertdialog"]')
      expect(dialog.get('h2').text()).toBe('编辑对话名称')
      const input = dialog.get('input')
      expect((input.element as HTMLInputElement).value).toBe('历史对话 2')
      await input.setValue('未保存的修改')
      await dialog.findAll('button')[0].trigger('click')
      expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
      expect(renameSessionTitle).not.toHaveBeenCalled()
      expect(history.props('sessions')[1].name).toBe('历史对话 2')
      expect(history.props('currentSessionId')).toBe(sessions[0].id)
      expect(history.find('.history-panel').exists()).toBe(true)

      await rename.trigger('click')
      expect((wrapper.get('.session-name-field input').element as HTMLInputElement).value).toBe(
        '历史对话 2',
      )
      vi.mocked(renameSessionTitle).mockResolvedValueOnce({
        session_id: sessions[1].id,
        title: '历史学习笔记',
        status: 'manual',
        retry_pending: false,
      })
      await wrapper.get('.session-name-field input').setValue('  历史学习笔记  ')
      await wrapper.get('[role="alertdialog"] .primary').trigger('click')
      await flushPromises()
      expect(renameSessionTitle).toHaveBeenCalledWith(sessions[1].id, '历史学习笔记')
      expect(history.props('sessions')[1].name).toBe('历史学习笔记')
      expect(history.props('currentSessionId')).toBe(sessions[0].id)
      expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
    },
  )

  it.each(['socratic', 'normal'] as const)(
    'waits for confirmation and server success before deleting a %s history entry',
    async (mode) => {
      const sessions = seedHistory(mode)
      const wrapper = await mountDialogue(mode)
      await wrapper.get('[title="对话历史"]').trigger('click')
      const history = wrapper.findComponent(DialogueHistoryPanel)
      const remove = history.get(`[data-session-id="${sessions[1].id}"] [title="删除"]`)
      await remove.trigger('click')
      expect(wrapper.get('[role="alertdialog"]').text()).toContain('历史对话 2')
      expect(deleteChatSession).not.toHaveBeenCalled()
      await wrapper.get('[role="alertdialog"]').findAll('button')[0].trigger('click')
      expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
      expect(history.props('sessions')).toHaveLength(2)
      expect(deleteChatSession).not.toHaveBeenCalled()

      let resolveDelete!: (value: number) => void
      vi.mocked(deleteChatSession).mockImplementationOnce(
        () => new Promise<number>((resolve) => (resolveDelete = resolve)),
      )
      await remove.trigger('click')
      const confirm = wrapper.get('[role="alertdialog"] .primary')
      await confirm.trigger('click')
      await confirm.trigger('click')
      expect(deleteChatSession).toHaveBeenCalledTimes(1)
      expect(deleteChatSession).toHaveBeenCalledWith(sessions[1].id)
      expect(history.props('sessions')).toHaveLength(2)
      expect(wrapper.get('[role="alertdialog"]').text()).toContain('删除中…')
      expect(
        wrapper.get('[role="alertdialog"]').findAll('button')[0].attributes('disabled'),
      ).toBeDefined()
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await flushPromises()
      expect(wrapper.find('[role="alertdialog"]').exists()).toBe(true)
      resolveDelete(1)
      await flushPromises()
      expect(history.props('sessions').map((session) => session.id)).toEqual([sessions[0].id])
      expect(history.props('currentSessionId')).toBe(sessions[0].id)
      expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
    },
  )

  it('retains the history and shows a retryable error when deletion fails', async () => {
    const sessions = seedHistory('normal')
    const wrapper = await mountDialogue('normal')
    await wrapper.get('[title="对话历史"]').trigger('click')
    const history = wrapper.findComponent(DialogueHistoryPanel)
    await history.get(`[data-session-id="${sessions[1].id}"] [title="删除"]`).trigger('click')
    vi.mocked(deleteChatSession).mockRejectedValueOnce(new Error('网络中断'))
    await wrapper.get('[role="alertdialog"] .primary').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alertdialog"] [role="alert"]').text()).toContain('网络中断')
    expect(history.props('sessions')).toHaveLength(2)
    await wrapper.get('[role="alertdialog"] .primary').trigger('click')
    await flushPromises()
    expect(history.props('sessions')).toHaveLength(1)
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
  })

  it.each(['socratic', 'normal'] as const)(
    'creates a new %s conversation after confirming deletion of its final history entry',
    async (mode) => {
      const [session] = seedHistory(mode, 1)
      const wrapper = await mountDialogue(mode)
      await wrapper.get('[title="对话历史"]').trigger('click')
      const history = wrapper.findComponent(DialogueHistoryPanel)
      await history.get('[title="删除"]').trigger('click')
      await wrapper.get('[role="alertdialog"] .primary').trigger('click')
      await flushPromises()
      expect(deleteChatSession).toHaveBeenCalledWith(session.id)
      expect(history.props('sessions')).toHaveLength(1)
      expect(history.props('sessions')[0].id).not.toBe(session.id)
      expect(history.props('sessions')[0].name).toBe('新对话')
      expect(wrapper.get('.dlg-title').text()).toBe('新对话')
      expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
    },
  )

  it.each(['socratic', 'normal'] as const)(
    'renames the %s session from the header and synchronizes history without changing its topic or node',
    async (mode) => {
      const session = createDefaultSession(mode)
      session.messages.push({ role: 'user', text: 'Redis 和 MySQL 有什么区别？', time: '10:00' })
      if (mode === 'socratic') {
        session.topicId = 1
        session.topicTitle = 'Redis'
        session.nodeKey = 'redis-map'
        const learning = useLearningStore()
        learning.topics = [{ id: '1', title: 'Redis', emoji: '', nodes: 1, mastered: 0 }]
        learning.activeTopicId = '1'
        learning.nodes = [
          {
            id: 'redis-map',
            label: '建立 Redis 学习地图',
            sub: '',
            x: 0,
            y: 0,
            state: 'available',
          },
        ]
      }
      localStorage.setItem(`sm_${mode}_sessions`, JSON.stringify([session]))
      localStorage.setItem(`sm_${mode}_cur`, session.id)
      vi.mocked(getSessionTitles).mockResolvedValue([
        {
          session_id: session.id,
          title: 'Redis 与 MySQL 的区别',
          status: 'ready',
          retry_pending: false,
        },
      ])
      vi.mocked(renameSessionTitle).mockResolvedValue({
        session_id: session.id,
        title: '我的 Redis 学习笔记',
        status: 'manual',
        retry_pending: false,
      })
      const wrapper = await mountDialogue(mode)
      expect(wrapper.findComponent({ name: 'TopicNameBar' }).exists()).toBe(false)
      const editButton = wrapper.get('[aria-label="编辑对话名称"]')
      expect(editButton.attributes('disabled')).toBeUndefined()
      await editButton.trigger('click')
      const dialog = wrapper.get('[role="alertdialog"]')
      const nameInput = dialog.get('input')
      expect((nameInput.element as HTMLInputElement).value).toBe('Redis 与 MySQL 的区别')
      expect(wrapper.find('.history-name-input').exists()).toBe(false)
      await nameInput.setValue('  我的 Redis 学习笔记  ')
      await nameInput.trigger('keydown.enter')
      await flushPromises()
      expect(renameSessionTitle).toHaveBeenCalledWith(session.id, '我的 Redis 学习笔记')
      expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
      expect(wrapper.get(mode === 'socratic' ? '.dlg-sub' : '.dlg-title').text()).toBe(
        '我的 Redis 学习笔记',
      )
      const renamed = wrapper.findComponent(DialogueHistoryPanel).props('sessions')[0]
      expect(renamed.name).toBe('我的 Redis 学习笔记')
      if (mode === 'socratic') {
        expect(wrapper.get('.dlg-title').text()).toBe('建立 Redis 学习地图')
        expect(renamed.topicTitle).toBe('Redis')
        expect(useLearningStore().topics[0].title).toBe('Redis')
      }
    },
  )

  it('preserves an unsaved header name on failure and prevents blank or duplicate rename requests', async () => {
    const session = createDefaultSession('normal')
    session.messages.push({ role: 'user', text: '问题', time: '10:00' })
    localStorage.setItem('sm_normal_sessions', JSON.stringify([session]))
    vi.mocked(getSessionTitles).mockResolvedValue([
      { session_id: session.id, title: '原名称', status: 'ready', retry_pending: false },
    ])
    const wrapper = await mountDialogue('normal')
    await wrapper.get('[aria-label="编辑对话名称"]').trigger('click')
    const input = wrapper.get('.session-name-field input')
    await input.setValue('   ')
    await input.trigger('keydown.enter')
    expect(wrapper.get('.session-name-error').text()).toBe('请输入对话名称')
    expect(renameSessionTitle).not.toHaveBeenCalled()
    await input.setValue('新的名称')
    await input.trigger('keydown.enter', { isComposing: true })
    expect(renameSessionTitle).not.toHaveBeenCalled()
    vi.mocked(renameSessionTitle).mockRejectedValueOnce(new Error('保存失败，请重试'))
    await input.trigger('keydown.enter')
    await flushPromises()
    expect(wrapper.get('.session-name-error').text()).toBe('保存失败，请重试')
    expect((input.element as HTMLInputElement).value).toBe('新的名称')
    expect(wrapper.get('.dlg-title').text()).toBe('原名称')
    const cancel = wrapper.get('[role="alertdialog"]').findAll('button')[0]
    await cancel.trigger('click')
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
    expect(wrapper.get('.dlg-title').text()).toBe('原名称')

    await wrapper.get('[aria-label="编辑对话名称"]').trigger('click')
    const retryInput = wrapper.get('.session-name-field input')
    expect((retryInput.element as HTMLInputElement).value).toBe('原名称')
    await retryInput.setValue('重试后的名称')
    let resolveRename!: (value: Awaited<ReturnType<typeof renameSessionTitle>>) => void
    vi.mocked(renameSessionTitle).mockImplementationOnce(
      () => new Promise((resolve) => (resolveRename = resolve)),
    )
    await retryInput.trigger('keydown.enter')
    await retryInput.trigger('keydown.enter')
    await flushPromises()
    expect(renameSessionTitle).toHaveBeenCalledTimes(2)
    expect(wrapper.get('.session-name-field input').attributes('disabled')).toBeDefined()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(true)
    resolveRename({
      session_id: session.id,
      title: '重试后的名称',
      status: 'manual',
      retry_pending: false,
    })
    await flushPromises()
    expect(wrapper.get('.dlg-title').text()).toBe('重试后的名称')
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
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
