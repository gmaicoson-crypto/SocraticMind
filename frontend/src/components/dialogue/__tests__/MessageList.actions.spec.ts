import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import MessageList from '../MessageList.vue'
import type { Message } from '../../../types'
import { webSnapshot } from '../../../test/fixtures/webSearch'
import { createWelcomeMessage } from '../../../composables/useChatSessions'

function mountList(messages: Message[]) {
  return mount(MessageList, {
    props: {
      messages,
      streamingText: '',
      isThinking: false,
      avatarUrl: null,
      aiAvatarUrl: '/avatar.png',
    },
  })
}

describe('MessageList actions', () => {
  it('keeps whitespace-only streams in a single waiting row without a no-search decision', async () => {
    const wrapper = mountList([])
    await wrapper.setProps({
      isThinking: true,
      streamingText: ' \n\t ',
      streamingWeb: webSnapshot({ status: 'skipped', sources: [] }),
    })
    expect(wrapper.findAll('.msg-row.ai')).toHaveLength(1)
    expect(wrapper.findAll('.thinking-bubble .dot')).toHaveLength(3)
    expect(wrapper.find('.md-inline').exists()).toBe(false)
    expect(wrapper.find('.message-sources').exists()).toBe(false)
    await wrapper.setProps({ isThinking: false })
    expect(wrapper.find('.msg-row.ai').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps restored empty failures retryable without rendering source-only replies', async () => {
    const messages: Message[] = [
      { role: 'user', text: '原问题', time: '10:00', db_id: 1 },
      {
        role: 'ai',
        text: '',
        time: '10:01',
        db_id: 2,
        metadata: { status: 'failed', web: webSnapshot({ status: 'skipped', sources: [] }) },
      },
    ]
    const wrapper = mountList(messages)
    expect(wrapper.find('[data-message-index="1"]').exists()).toBe(false)
    expect(wrapper.find('.msg-row.ai').exists()).toBe(false)
    expect(wrapper.find('.message-sources').exists()).toBe(false)
    expect(wrapper.find('button[title="复制"]').exists()).toBe(true) // User text remains copyable.
    expect(wrapper.find('button[title="引用追问"]').exists()).toBe(false)
    const retry = wrapper.get('[data-message-index="0"] button[aria-label="重试"]')
    expect(retry.find('svg').exists()).toBe(true)
    expect(wrapper.get('[data-message-index="0"] .msg-actions').classes()).toContain('visible')
    expect(wrapper.find('button[title="重新回答"]').exists()).toBe(false)
    await retry.trigger('click')
    expect(wrapper.emitted('retry')).toEqual([[0]])
    await wrapper.setProps({ isThinking: true, streamingMessageId: 2 })
    expect(wrapper.findAll('.msg-row.ai')).toHaveLength(1)
    expect(wrapper.findAll('.thinking-bubble .dot')).toHaveLength(3)
    expect(wrapper.find('.empty-reply').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="重试"]').exists()).toBe(false)
    expect(wrapper.props('messages')).toHaveLength(2)
    await wrapper.setProps({ isThinking: false })
    expect(wrapper.find('.msg-row.ai').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="重试"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it.each([undefined, 'generating', 'complete', 'interrupted', 'failed'])(
    'hides restored blank AI replies with status %s while keeping the original question retryable',
    (status) => {
      const wrapper = mountList([
        { role: 'user', text: '原问题', time: '10:00', db_id: 1 },
        {
          role: 'ai',
          text: ' \n\t ',
          time: '10:01',
          db_id: 2,
          metadata: { status, web: webSnapshot() },
        },
      ])
      expect(wrapper.findAll('.msg-row')).toHaveLength(1)
      expect(wrapper.find('.ai-avatar').exists()).toBe(false)
      expect(wrapper.find('.message-sources').exists()).toBe(false)
      expect(wrapper.get('[data-message-index="0"]').text()).toContain('原问题')
      expect(wrapper.find('[data-message-index="0"] button[aria-label="重试"]').exists()).toBe(true)
      wrapper.unmount()
    },
  )

  it('shows a valid answer arriving after a restored blank reply without changing action indexes', async () => {
    const user: Message = { role: 'user', text: '原问题', time: '10:00', db_id: 1 }
    const reply: Message = {
      role: 'ai',
      text: '',
      time: '10:01',
      db_id: 2,
      metadata: { status: 'generating' },
    }
    const wrapper = mountList([user, reply])
    expect(wrapper.find('.msg-row.ai').exists()).toBe(false)
    await wrapper.setProps({
      messages: [user, { ...reply, text: '有效回答', metadata: { status: 'complete' } }],
    })
    expect(wrapper.get('[data-message-index="1"]').text()).toContain('有效回答')
    expect(wrapper.find('button[aria-label="重试"]').exists()).toBe(false)
    await wrapper.get('button[aria-label="重新回答"]').trigger('click')
    expect(wrapper.emitted('retry')).toEqual([[1]])
    await wrapper.setProps({
      messages: [user, { ...reply, choices: [{ label: 'A', text: '有效选项' }] }],
    })
    expect(wrapper.findAll('.msg-row.ai')).toHaveLength(1)
    expect(wrapper.get('.choice-btn').text()).toContain('有效选项')
    wrapper.unmount()
  })

  it('shows recovered partial replies once while keeping completed history visible', async () => {
    const wrapper = mountList([
      { role: 'ai', text: '已完成的回答', time: '10:00', db_id: 1 },
      { role: 'user', text: '下一问', time: '10:01', db_id: 2 },
      {
        role: 'ai',
        text: '部分回答',
        time: '10:02',
        db_id: 3,
        metadata: { status: 'interrupted' },
      },
    ])
    await wrapper.setProps({ isThinking: true, streamingMessageId: 3, streamingText: '部分回答' })
    expect(wrapper.find('[data-message-index="2"]').exists()).toBe(false)
    expect(wrapper.get('[data-message-index="0"]').text()).toContain('已完成的回答')
    expect(wrapper.findAll('.msg-row.ai')).toHaveLength(2)
    expect(wrapper.find('.thinking-bubble').exists()).toBe(false)
    expect(wrapper.props('messages')).toHaveLength(3)
    wrapper.unmount()
  })

  it('renders choice-only replies without an empty bubble or an extra waiting row', async () => {
    const wrapper = mountList([])
    await wrapper.setProps({
      isThinking: true,
      streamingText: '[CHOICES]\nA. 选项一\nB. 选项二\n[ECHOICES]',
      streamingChoices: [
        { label: 'A', text: '选项一' },
        { label: 'B', text: '选项二' },
      ],
    })
    expect(wrapper.findAll('.msg-row.ai')).toHaveLength(1)
    expect(wrapper.find('.bubble').exists()).toBe(false)
    expect(wrapper.findAll('.choice-btn')).toHaveLength(2)
    wrapper.unmount()
  })

  it('shows retry only on the latest AI reply', async () => {
    const wrapper = mountList([
      { role: 'ai', text: '欢迎', time: '10:00' },
      { role: 'user', text: '问题', time: '10:01' },
      { role: 'ai', text: '旧回答', time: '10:02' },
      { role: 'user', text: '再问', time: '10:03' },
      { role: 'ai', text: '新回答', time: '10:04' },
    ])

    const retry = wrapper.findAll('button[title="重新回答"]')
    expect(retry).toHaveLength(1)
    await retry[0].trigger('click')
    expect(wrapper.emitted('retry')).toEqual([[4]])
  })

  it('updates the user retry action when the failed request changes despite memoized rows', async () => {
    const wrapper = mountList([
      { role: 'user', text: '第一问', time: '10:00' },
      { role: 'user', text: '第二问', time: '10:01' },
    ])
    expect(wrapper.find('button[aria-label="重试"]').exists()).toBe(false)
    await wrapper.setProps({ retryUserIndex: 1 })
    expect(wrapper.get('[data-message-index="1"] .msg-actions').classes()).toContain('visible')
    await wrapper.get('[data-message-index="1"] button[aria-label="重试"]').trigger('click')
    expect(wrapper.emitted('retry')).toEqual([[1]])
    await wrapper.setProps({ retryUserIndex: 0 })
    expect(wrapper.find('[data-message-index="1"] button[aria-label="重试"]').exists()).toBe(false)
    expect(wrapper.find('[data-message-index="0"] button[aria-label="重试"]').exists()).toBe(true)
    await wrapper.setProps({ isThinking: true })
    expect(wrapper.find('button[aria-label="重试"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('places restored interrupted reply retry on its paired user and keeps partial text', async () => {
    const wrapper = mountList([
      { role: 'user', text: '原问题', time: '10:00', db_id: 1 },
      { role: 'user', text: '其他问题', time: '10:01', db_id: 2 },
      {
        role: 'ai',
        text: '部分回答',
        time: '10:02',
        db_id: 3,
        metadata: { status: 'interrupted', user_message_id: 1 },
      },
    ])
    expect(wrapper.get('[data-message-index="2"]').text()).toContain('部分回答')
    expect(wrapper.find('[data-message-index="1"] button[aria-label="重试"]').exists()).toBe(false)
    await wrapper.get('[data-message-index="0"] button[aria-label="重试"]').trigger('click')
    expect(wrapper.emitted('retry')).toEqual([[0]])
    wrapper.unmount()
  })

  it('allows deleting the first persisted message after history restoration', async () => {
    const wrapper = mountList([{ role: 'user', text: '原问题', time: '10:01', db_id: 10 }])
    await wrapper.get('button[title="删除"]').trigger('click')
    expect(wrapper.emitted('delete')).toEqual([[0]])
    wrapper.unmount()
  })

  it('places the quote below the follow-up and jumps to its source', async () => {
    const scrollIntoView = vi.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoView
    const wrapper = mountList([
      { role: 'ai', text: '原回答', time: '10:00', db_id: 7 },
      { role: 'user', text: '为什么？', time: '10:01', quote: '原回答', quote_source_db_id: 7 },
    ])

    const followup = wrapper.find('[data-message-index="1"]')
    expect(
      followup
        .find('.bubble')
        .element.compareDocumentPosition(followup.find('.msg-quote').element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    await followup.get('button.msg-quote').trigger('click')
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    expect(wrapper.find('[data-message-index="0"]').classes()).toContain('quote-target')
    wrapper.unmount()
  })

  it('hides learning workflow history while preserving normal chat actions', async () => {
    const messages: Message[] = [
      createWelcomeMessage('socratic'),
      { role: 'user', text: '我想学中医理论', time: '10:00', messageType: 'chat' },
      { role: 'ai', text: '测试问题', time: '10:01', messageType: 'agent_step' },
      { role: 'user', text: '测试答案', time: '10:02', messageType: 'agent_answer' },
      { role: 'ai', text: '学习计划预览已生成', time: '10:03', messageType: 'plan_preview' },
      { role: 'ai', text: '学习计划已创建', time: '10:04', messageType: 'agent_result' },
      { role: 'ai', text: '正常对话', time: '10:05', messageType: 'chat', db_id: 7 },
      {
        role: 'user',
        text: '追问',
        time: '10:06',
        messageType: 'chat',
        quote: '正常对话',
        quote_source_db_id: 7,
      },
    ]
    const wrapper = mount(MessageList, {
      props: {
        messages,
        hideWelcome: true,
        streamingText: '',
        isThinking: false,
        avatarUrl: null,
        aiAvatarUrl: '/avatar.png',
      },
    })

    expect(wrapper.findAll('.msg-row')).toHaveLength(3)
    expect(wrapper.text()).not.toContain('测试问题')
    expect(wrapper.text()).not.toContain('测试答案')
    expect(wrapper.text()).not.toContain('学习计划')
    expect(wrapper.text()).not.toContain('Socrates，你的 AI 学习导师')
    expect(wrapper.get('[data-message-index="6"]').text()).toContain('正常对话')

    await wrapper.get('[data-message-index="1"] button[title="删除"]').trigger('click')
    expect(wrapper.emitted('delete')).toEqual([[1]])

    const scrollIntoView = vi.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoView
    await wrapper.get('[data-message-index="7"] button.msg-quote').trigger('click')
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    expect(wrapper.get('[data-message-index="6"]').classes()).toContain('quote-target')
    wrapper.unmount()
  })

  it('does not reactivate older chat choices after hidden workflow messages', () => {
    const wrapper = mountList([
      { role: 'user', text: '问题', time: '10:00' },
      {
        role: 'ai',
        text: '选择一项',
        time: '10:01',
        choices: [{ label: 'A', text: '答案' }],
      },
      { role: 'ai', text: '测试问题', time: '10:02', messageType: 'agent_step' },
    ])

    expect(wrapper.find('button[title="重新回答"]').exists()).toBe(false)
    expect(wrapper.get('.choice-btn').attributes('disabled')).toBeDefined()
  })

  it('keeps the welcome message until a learning flow starts', async () => {
    const wrapper = mountList([createWelcomeMessage('socratic')])
    expect(wrapper.text()).toContain('Socrates，你的 AI 学习导师')

    await wrapper.setProps({ hideWelcome: true })
    expect(wrapper.find('.msg-row').exists()).toBe(false)
  })
  it('refreshes sources on a metadata-only update despite memoized message rows', async () => {
    const message: Message = { role: 'ai', text: '结论 [[source:s1]]', time: '10:00', db_id: 10 }
    const wrapper = mountList([message])
    expect(wrapper.find('.message-sources').exists()).toBe(false)
    await wrapper.setProps({ messages: [{ ...message, metadata: { web: webSnapshot() } }] })
    expect(wrapper.get('.source-citation').attributes('href')).toBe('https://example.com/releases')
    expect(wrapper.get('.message-sources').text()).toContain('引用 1 条来源')
    expect(wrapper.get('.message-sources').text()).toContain('依据相关片段')
    wrapper.unmount()
  })
})
