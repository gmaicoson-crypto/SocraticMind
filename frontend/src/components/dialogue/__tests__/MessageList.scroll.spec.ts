import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MessageList from '../MessageList.vue'
import type { Message } from '../../../types'

const wrappers: VueWrapper<InstanceType<typeof MessageList>>[] = []
const frames = new Map<number, FrameRequestCallback>()

function mountList(messages: Message[] = []) {
  const wrapper = mount(MessageList, {
    props: {
      messages,
      streamingText: '正在回复',
      isThinking: true,
      avatarUrl: null,
      aiAvatarUrl: '/avatar.png',
    },
  })
  wrappers.push(wrapper)
  return wrapper
}

function viewport(wrapper: ReturnType<typeof mountList>) {
  const scroll = wrapper.get('.dlg-messages')
  let height = 1000
  let top = 0
  Object.defineProperties(scroll.element, {
    scrollHeight: { get: () => height },
    clientHeight: { get: () => 400 },
    scrollTop: {
      get: () => top,
      set: (value: number) => {
        top = Math.max(0, Math.min(value, height - 400))
      },
    },
  })
  return {
    get top() {
      return top
    },
    grow() {
      height += 200
    },
    async moveTo(value: number) {
      ;(scroll.element as HTMLElement).scrollTop = value
      await scroll.trigger('scroll')
    },
  }
}

async function flushFrames() {
  const callbacks = [...frames.values()]
  frames.clear()
  callbacks.forEach((callback) => callback(0))
  await nextTick()
}

describe('MessageList scrolling during AI replies', () => {
  beforeEach(() => {
    let frameId = 0
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++frameId, callback)
      return frameId
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  })

  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    frames.clear()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('follows growing replies while the user stays at the bottom, including large chunks', async () => {
    const wrapper = mountList()
    const view = viewport(wrapper)
    wrapper.vm.scrollToBottom()
    await nextTick()
    expect(view.top).toBe(600)

    view.grow()
    // Content growth can trigger a scroll event without the user moving upwards.
    await view.moveTo(600)
    await wrapper.setProps({ streamingText: '正在回复，继续补充内容' })
    wrapper.vm.scrollToBottom()
    await nextTick()
    expect(view.top).toBe(800)
    await flushFrames()
    expect(wrapper.find('.scroll-to-bottom').exists()).toBe(false)
  })

  it('preserves even a small upward scroll through new chunks and reply completion', async () => {
    const wrapper = mountList()
    const view = viewport(wrapper)
    wrapper.vm.scrollToBottom()
    await nextTick()

    await view.moveTo(580)
    view.grow()
    await wrapper.setProps({ streamingText: '新的回复内容' })
    wrapper.vm.scrollToBottom()
    await nextTick()
    expect(view.top).toBe(580)

    await wrapper.setProps({
      isThinking: false,
      streamingText: '',
      messages: [{ role: 'ai', text: '新的回复内容', time: '10:00' }],
    })
    wrapper.vm.scrollToBottom()
    await nextTick()
    expect(view.top).toBe(580)
    await flushFrames()
    expect(wrapper.find('.scroll-to-bottom').exists()).toBe(true)
  })

  it('cancels a queued automatic scroll before the next frame when the user moves up', async () => {
    const wrapper = mountList()
    const view = viewport(wrapper)
    wrapper.vm.scrollToBottom()
    await nextTick()

    view.grow()
    wrapper.vm.scrollToBottom()
    await view.moveTo(500)
    await nextTick()
    expect(view.top).toBe(500)
  })

  it('pauses on upward wheel intent before the browser dispatches the scroll event', async () => {
    const wrapper = mountList()
    const view = viewport(wrapper)
    wrapper.vm.scrollToBottom()
    await nextTick()

    view.grow()
    wrapper.vm.scrollToBottom()
    await wrapper.get('.dlg-messages').trigger('wheel', { deltaY: -20 })
    await nextTick()
    expect(view.top).toBe(600)
  })

  it('allows moving in either direction and resumes following only on returning to the bottom', async () => {
    const wrapper = mountList()
    const view = viewport(wrapper)
    wrapper.vm.scrollToBottom()
    await nextTick()

    await view.moveTo(200)
    await view.moveTo(400)
    view.grow()
    wrapper.vm.scrollToBottom()
    await nextTick()
    expect(view.top).toBe(400)

    await view.moveTo(800)
    view.grow()
    wrapper.vm.scrollToBottom()
    await nextTick()
    expect(view.top).toBe(1000)
    await flushFrames()
    expect(wrapper.find('.scroll-to-bottom').exists()).toBe(false)
  })

  it('uses the existing bottom button to jump to the latest reply and resume following', async () => {
    const wrapper = mountList()
    const view = viewport(wrapper)
    wrapper.vm.scrollToBottom()
    await nextTick()
    await view.moveTo(300)
    await flushFrames()

    await wrapper.get('.scroll-to-bottom').trigger('click')
    expect(view.top).toBe(600)
    expect(wrapper.find('.scroll-to-bottom').exists()).toBe(false)
    view.grow()
    wrapper.vm.scrollToBottom()
    await nextTick()
    expect(view.top).toBe(800)
  })

  it('keeps a quoted history jump visible while streaming continues', async () => {
    const scrollIntoView = vi.fn()
    const wrapper = mountList([
      { role: 'ai', text: '原回答', time: '10:00', db_id: 7 },
      { role: 'user', text: '为什么？', time: '10:01', quote: '原回答', quote_source_db_id: 7 },
    ])
    ;(wrapper.get('[data-message-index="0"]').element as HTMLElement).scrollIntoView =
      scrollIntoView
    const view = viewport(wrapper)
    wrapper.vm.scrollToBottom()
    await nextTick()

    await wrapper.get('button.msg-quote').trigger('click')
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    view.grow()
    wrapper.vm.scrollToBottom()
    await nextTick()
    expect(view.top).toBe(600)
  })
})
