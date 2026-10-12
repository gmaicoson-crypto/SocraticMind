import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import Sidebar from '../Sidebar.vue'
import SocraticDialogue from '../SocraticDialogue.vue'
import { createDefaultSession } from '../../composables/useChatSessions'
import { useAgentStore } from '../../stores/agent'
import { useLearningStore } from '../../stores/learning'
import { useUiStore } from '../../stores/ui'
import { chatStream, getSuggestions } from '../../api/chat'
import { getAttachmentCapabilities } from '../../api/attachments'
import { attachmentCapabilities } from '../../test/fixtures/attachments'

vi.mock('../../api/chat', () => ({
  chatStream: vi.fn(),
  cancelChatStream: vi.fn().mockResolvedValue(undefined),
  deleteChatSession: vi.fn(),
  deleteMessages: vi.fn(),
  getAllMessages: vi.fn().mockResolvedValue([]),
  getSuggestions: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../api/progress', () => ({
  getStreak: vi.fn().mockResolvedValue({ streak: 0, total_days: 0, recent: [] }),
  recordToday: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../api/attachments', () => ({
  getAttachmentCapabilities: vi.fn(),
  getAttachments: vi.fn(),
  uploadAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
  retryAttachment: vi.fn(),
  acceptAttachmentCoverage: vi.fn(),
  getAttachmentBlob: vi.fn(),
}))

vi.mock('../../api/models', () => ({
  getLLMModels: vi.fn().mockResolvedValue([]),
  createCustomModel: vi.fn(),
  updateCustomModel: vi.fn(),
  deleteCustomModel: vi.fn(),
}))

describe('onboarding entry points', () => {
  beforeEach(() => {
    localStorage.clear()
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    })
    setActivePinia(createPinia())
    vi.mocked(getAttachmentCapabilities).mockResolvedValue(attachmentCapabilities)
    vi.mocked(getSuggestions).mockReset().mockResolvedValue({ suggestions: [], source: 'ai' })
    vi.mocked(chatStream).mockClear()
  })

  it('routes recommendations and chat intents to the same onboarding draft', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const learning = useLearningStore()
    const agent = useAgentStore()
    learning.recommendations = [{ title: 'Rust', emoji: 'R', reason: 'Systems' }]

    const sidebar = mount(Sidebar, { global: { plugins: [pinia] } })
    await sidebar.get('.recommend-row').trigger('click')
    expect(agent.onboardingTopic).toBe('Rust')
    sidebar.unmount()

    agent.closeOnboarding()
    const dialogue = mount(SocraticDialogue, { global: { plugins: [pinia] } })
    const textarea = dialogue.get('textarea')
    await textarea.setValue('我想学 Rust')
    await textarea.trigger('keydown.enter')
    await flushPromises()

    expect(agent.onboardingTopic).toBe('Rust')
    dialogue.unmount()
  })

  it('toggles the sidebar and persists the collapsed state', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const ui = useUiStore()
    const sidebar = mount(Sidebar, { global: { plugins: [pinia] } })

    expect(ui.sidebarCollapsed).toBe(false)
    await sidebar.get('.collapse-btn').trigger('click')
    expect(ui.sidebarCollapsed).toBe(true)
    expect(localStorage.getItem('sm_sidebar_collapsed')).toBe('true')
    expect(sidebar.find('.sidebar').classes()).toContain('is-collapsed')

    await sidebar.get('.collapsed-toggle').trigger('click')
    expect(ui.sidebarCollapsed).toBe(false)
    expect(localStorage.getItem('sm_sidebar_collapsed')).toBe('false')
    sidebar.unmount()
  })

  it('sends a recommended dialogue immediately', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    vi.mocked(chatStream).mockClear()

    const dialogue = mount(SocraticDialogue, { global: { plugins: [pinia] } })
    await dialogue.findAll('.mode-btn')[1].trigger('click')
    await flushPromises()
    await dialogue.get('.chips-list .chip').trigger('click')
    await flushPromises()

    expect(vi.mocked(chatStream).mock.calls[0]?.[0].userInput).toBe('今天天气怎么样')
    expect((dialogue.get('textarea').element as HTMLTextAreaElement).value).toBe('')
    dialogue.unmount()
  })

  it('requests fresh recommendations and rotates local choices after a failed request', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const suggestions = vi.mocked(getSuggestions)
    suggestions.mockReset()
    suggestions
      .mockResolvedValueOnce({ suggestions: ['一个全新话题'], source: 'ai' })
      .mockRejectedValueOnce(new Error('offline'))

    const dialogue = mount(SocraticDialogue, { global: { plugins: [pinia] } })
    await flushPromises()
    const first = dialogue.get('.chips-list .chip').text()
    await dialogue.get('.chip-refresh').trigger('click')
    await flushPromises()

    expect(suggestions).toHaveBeenCalledWith('socratic', [first])
    expect(dialogue.get('.chips-list .chip').text()).toBe('一个全新话题')

    await dialogue.get('.chip-refresh').trigger('click')
    await flushPromises()
    expect(suggestions).toHaveBeenCalledTimes(2)
    expect(suggestions.mock.calls[1][1]).toEqual(['一个全新话题'])
    expect(dialogue.get('.chips-list .chip').text()).not.toBe('一个全新话题')
    dialogue.unmount()
  })

  function mountTopicDialogue() {
    const learning = useLearningStore()
    learning.topics = [{ id: '7', title: 'RAG', nodes: 1, mastered: 0, emoji: 'R' }]
    learning.activeTopicId = '7'
    learning.nodes = [
      { id: 'retrieval', label: '检索器', sub: '向量检索', x: 0, y: 0, state: 'available' },
    ]
    learning.setActiveNode(learning.nodes[0])
    const session = {
      ...createDefaultSession('socratic'),
      topicId: 7,
      topicTitle: 'RAG',
      name: 'RAG',
    }
    localStorage.setItem('sm_socratic_sessions', JSON.stringify([session]))
    localStorage.setItem('sm_socratic_cur', session.id)
    return { dialogue: mount(SocraticDialogue), session }
  }

  it('sends topic recommendations as follow-ups and refreshes them after the answer', async () => {
    vi.mocked(getSuggestions)
      .mockResolvedValueOnce({ suggestions: ['讲讲检索器的工作原理'], source: 'ai' })
      .mockResolvedValueOnce({ suggestions: ['如何控制检索噪声？'], source: 'ai' })
    const { dialogue, session } = mountTopicDialogue()
    await flushPromises()
    expect(getSuggestions).toHaveBeenCalledWith('socratic', [], {
      topicId: 7,
      sessionId: session.id,
      nodeKey: 'retrieval',
    })
    expect(dialogue.get('.chips-list .chip').text()).toBe('讲讲检索器的工作原理')
    await dialogue.get('.chips-list .chip').trigger('click')
    await flushPromises()
    expect(chatStream).toHaveBeenCalledTimes(1)
    expect(vi.mocked(chatStream).mock.calls[0][0]).toMatchObject({
      userInput: '讲讲检索器的工作原理',
      topicId: 7,
      nodeKey: 'retrieval',
      sessionId: session.id,
    })
    expect(useAgentStore().onboardingTopic).toBeNull()
    const callbacks = vi.mocked(chatStream).mock.calls[0][1]
    callbacks.onChunk('检索噪声会影响生成结果。')
    await flushPromises()
    expect(getSuggestions).toHaveBeenCalledTimes(1)
    callbacks.onDone()
    await flushPromises()
    expect(getSuggestions).toHaveBeenCalledTimes(2)
    expect(dialogue.get('.chips-list .chip').text()).toBe('如何控制检索噪声？')
    dialogue.unmount()
  })

  it('restores topic recommendations when creating a new dialogue from a bound one', async () => {
    vi.mocked(getSuggestions).mockResolvedValue({ suggestions: ['RAG 如何检索？'], source: 'ai' })
    const { dialogue } = mountTopicDialogue()
    await flushPromises()
    expect(dialogue.get('.chips-list .chip').text()).toBe('RAG 如何检索？')
    await dialogue.get('button[title="新建对话"]').trigger('click')
    await flushPromises()
    expect(dialogue.get('.chips-list .chip').text()).toBe('我想学 Python')
    await dialogue.get('.chips-list .chip').trigger('click')
    await flushPromises()
    expect(useAgentStore().onboardingTopic).toBe('Python')
    expect(chatStream).not.toHaveBeenCalled()
    dialogue.unmount()
  })

  it('switches everyday openers to current conversation suggestions after the normal reply', async () => {
    const session = createDefaultSession('normal')
    localStorage.setItem('sm_normal_sessions', JSON.stringify([session]))
    localStorage.setItem('sm_normal_cur', session.id)
    vi.mocked(getSuggestions).mockResolvedValue({
      suggestions: ['海边露营需要准备什么？'],
      source: 'ai',
    })
    const dialogue = mount(SocraticDialogue)
    await dialogue.findAll('.mode-btn')[1].trigger('click')
    await flushPromises()
    expect(dialogue.get('.chips-list .chip').text()).toBe('今天天气怎么样')
    expect(getSuggestions).not.toHaveBeenCalled()

    await dialogue.get('textarea').setValue('周末想去海边')
    await dialogue.get('textarea').trigger('keydown.enter')
    await flushPromises()
    const callbacks = vi.mocked(chatStream).mock.calls[0][1]
    callbacks.onChunk('可以去海边露营。')
    await flushPromises()
    expect(getSuggestions).not.toHaveBeenCalled()
    callbacks.onDone()
    await flushPromises()
    expect(getSuggestions).toHaveBeenCalledWith('normal', [], { sessionId: session.id })
    expect(dialogue.get('.chips-list .chip').text()).toBe('海边露营需要准备什么？')
    await dialogue.get('.chips-list .chip').trigger('click')
    await flushPromises()
    expect(vi.mocked(chatStream).mock.calls.at(-1)?.[0]).toMatchObject({
      mode: 'normal',
      userInput: '海边露营需要准备什么？',
      sessionId: session.id,
    })
    expect(getSuggestions).toHaveBeenCalledTimes(1)
    dialogue.unmount()
  })

  it('loads recommendations for an existing normal chat and resets to daily themes for a new one', async () => {
    const session = createDefaultSession('normal')
    session.messages.push(
      { role: 'user', text: '周末想去海边', time: '10:00', db_id: 10 },
      { role: 'ai', text: '可以去海边露营。', time: '10:01', db_id: 11 },
    )
    localStorage.setItem('sm_normal_sessions', JSON.stringify([session]))
    localStorage.setItem('sm_normal_cur', session.id)
    vi.mocked(getSuggestions).mockResolvedValue({
      suggestions: ['海边露营需要准备什么？'],
      source: 'ai',
    })
    const dialogue = mount(SocraticDialogue)
    await dialogue.findAll('.mode-btn')[1].trigger('click')
    await flushPromises()
    expect(dialogue.get('.chips-list .chip').text()).toBe('海边露营需要准备什么？')
    await dialogue.get('button[title="新建对话"]').trigger('click')
    await flushPromises()
    expect(dialogue.get('.chips-list .chip').text()).toBe('今天天气怎么样')
    expect(getSuggestions).toHaveBeenCalledTimes(1)
    dialogue.unmount()
  })
})
