import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import DialogueInputBar from '../DialogueInputBar.vue'

describe('DialogueInputBar suggestions', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('fits suggestions before distributing limited extra space', async () => {
    let notifyResize = () => {}
    class MockResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        notifyResize = () => callback([], this as unknown as ResizeObserver)
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', MockResizeObserver)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      return { width: 80 } as DOMRect
    })

    const chips = ['建议一', '建议二', '建议三', '建议四', '建议五', '建议六']
    const wrapper = shallowMount(DialogueInputBar, {
      props: {
        input: '',
        chatMode: 'socratic',
        aiStyle: '标准',
        aiStyleOptions: ['标准'],
        chips,
        chipsLoading: false,
        quotedText: '',
        isThinking: false,
        isGenerating: false,
        socraticBadge: 0,
        normalBadge: 0,
        placeholder: '回答问题，或问我一个反问…',
      },
    })
    const content = wrapper.get('.chips-content').element
    Object.defineProperty(content, 'clientWidth', { configurable: true, value: 250 })
    notifyResize()
    await flushPromises()
    expect(wrapper.findAll('.chips-list .chip')).toHaveLength(2)
    expect((wrapper.get('.chips-list').element as HTMLElement).style.gap).toBe('10px')

    Object.defineProperty(content, 'clientWidth', { configurable: true, value: 292 })
    notifyResize()
    await flushPromises()
    expect(wrapper.findAll('.chips-list .chip')).toHaveLength(3)
    expect((wrapper.get('.chips-list').element as HTMLElement).style.gap).toBe('6px')

    Object.defineProperty(content, 'clientWidth', { configurable: true, value: 500 })
    notifyResize()
    await flushPromises()
    expect(wrapper.findAll('.chips-list .chip')).toHaveLength(5)

    await wrapper.get('.chips-list .chip').trigger('click')
    expect(wrapper.emitted('sendSuggestion')?.[0]).toEqual(['建议一'])
    expect(wrapper.emitted('update:input')).toBeUndefined()

    const listElement = wrapper.get('.chips-list').element
    await wrapper.setProps({ chipsLoading: true })
    expect(wrapper.get('.chips-list').element).toBe(listElement)
    expect(wrapper.findAll('.chips-list .chip').map((chip) => chip.text())).toEqual(
      chips.slice(0, 5),
    )
    expect(wrapper.find('.chip-skeleton').exists()).toBe(false)
    expect(wrapper.get('.chip-refresh').attributes('disabled')).toBeDefined()
    await wrapper.get('.chips-list .chip').trigger('click')
    expect(wrapper.emitted('sendSuggestion')).toHaveLength(2)
    await wrapper.get('.chip-refresh').trigger('click')
    expect(wrapper.emitted('refreshChips')).toBeUndefined()
    await wrapper.setProps({ chipsLoading: false })

    await wrapper.setProps({ isThinking: true })
    await wrapper.get('.chips-list .chip').trigger('click')
    expect(wrapper.emitted('sendSuggestion')).toHaveLength(2)
    await wrapper.get('.chip-refresh').trigger('click')
    expect(wrapper.emitted('refreshChips')?.[0]).toEqual([chips.slice(0, 5)])
    const nextChips = ['新建议一', '新建议二', '新建议三']
    await wrapper.setProps({ chips: nextChips })
    await flushPromises()
    expect(wrapper.get('.chips-list').element).toBe(listElement)
    expect(wrapper.findAll('.chips-list .chip').map((chip) => chip.text())).toEqual(nextChips)
    wrapper.unmount()
  })

  it.each([
    ['socratic', '回答问题，或问我一个反问…'],
    ['normal', '随便问我点什么…'],
  ] as const)('shows the %s message prompt without shortcuts', (chatMode, placeholder) => {
    const wrapper = shallowMount(DialogueInputBar, {
      props: {
        input: '',
        chatMode,
        aiStyle: '标准',
        aiStyleOptions: ['标准'],
        chips: [],
        chipsLoading: false,
        quotedText: '',
        isThinking: false,
        isGenerating: false,
        socraticBadge: 0,
        normalBadge: 0,
        placeholder,
      },
    })

    const input = wrapper.get('textarea')
    expect(input.element.value).toBe('')
    expect(input.attributes('placeholder')).toBe(placeholder)
    expect(input.attributes('aria-label')).toBe('输入消息')
    wrapper.unmount()
  })
})
