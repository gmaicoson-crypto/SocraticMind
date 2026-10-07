import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import InlineMarkdown from '../InlineMarkdown.vue'
import { webSnapshot } from '../../../test/fixtures/webSearch'

describe('InlineMarkdown', () => {
  it('refreshes citation links when metadata arrives without another text chunk', async () => {
    const wrapper = mount(InlineMarkdown, {
      props: { text: '结论 [[source:s1]]', assistant: true },
    })
    expect(wrapper.find('a.source-citation').exists()).toBe(false)
    await wrapper.setProps({ web: webSnapshot() })
    expect(wrapper.get('a.source-citation').attributes('href')).toBe('https://example.com/releases')
    wrapper.unmount()
  })

  it('copies code through delegated events with no inline JavaScript', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const wrapper = mount(InlineMarkdown, { props: { text: '```html\n<b>code</b>\n```' } })
    const button = wrapper.get('button.code-copy')
    expect(button.attributes('onclick')).toBeUndefined()
    await button.trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('<b>code</b>')
    expect(button.text()).toBe('已复制')
    wrapper.unmount()
  })
})
