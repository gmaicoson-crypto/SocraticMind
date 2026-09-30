import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import MessageList from '../MessageList.vue'
import type { Message } from '../../../types'
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
})
