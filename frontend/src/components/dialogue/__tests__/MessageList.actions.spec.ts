import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import MessageList from '../MessageList.vue'
import type { Message } from '../../../types'

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
})
