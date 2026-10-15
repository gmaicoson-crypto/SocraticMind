import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SocraticDialogue from '../SocraticDialogue.vue'
import DialogueInputBar from '../dialogue/DialogueInputBar.vue'
import MessageList from '../dialogue/MessageList.vue'
import { createDefaultSession } from '../../composables/useChatSessions'
import { uploadAttachment, getAttachmentCapabilities } from '../../api/attachments'
import { attachment, attachmentCapabilities } from '../../test/fixtures/attachments'
import {
  cancelChatStream,
  chatStream,
  deleteMessages,
  getAllMessages,
  getChatRequestState,
  getSuggestions,
} from '../../api/chat'

import { webSnapshot } from '../../test/fixtures/webSearch'
import type { WebSnapshot } from '../../types/webSearch'

vi.mock('../../api/chat', () => ({
  chatStream: vi.fn(),
  getChatRequestState: vi.fn(),
  cancelChatStream: vi.fn().mockResolvedValue(undefined),
  deleteChatSession: vi.fn(),
  deleteMessages: vi.fn(),
  getAllMessages: vi.fn().mockResolvedValue([]),
  getSuggestions: vi.fn(),
}))
vi.mock('../../api/attachments', () => ({
  getAttachmentCapabilities: vi.fn(),
  uploadAttachment: vi.fn(),
  getAttachments: vi.fn(),
  deleteAttachment: vi.fn(),
  retryAttachment: vi.fn(),
  acceptAttachmentCoverage: vi.fn(),
  getAttachmentBlob: vi.fn(),
}))
vi.mock('../../api/progress', () => ({
  getStreak: vi.fn().mockResolvedValue({ streak: 0, total_days: 0, recent: [] }),
  recordToday: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../api/models', () => ({
  getLLMModels: vi.fn().mockResolvedValue([]),
  createCustomModel: vi.fn(),
  updateCustomModel: vi.fn(),
  deleteCustomModel: vi.fn(),
}))

async function mountDialogue(initialWeb?: WebSnapshot) {
  const session = createDefaultSession('normal')
  session.messages.push(
    { role: 'user', text: '原问题', time: '2026-01-01T00:00:01Z', db_id: 10 },
    {
      role: 'ai',
      text: '原回答',
      time: '2026-01-01T00:00:02Z',
      db_id: 11,
      metadata: initialWeb ? { web: initialWeb } : undefined,
    },
  )
  localStorage.setItem('sm_normal_sessions', JSON.stringify([session]))
  localStorage.setItem('sm_normal_cur', session.id)
  const wrapper = mount(SocraticDialogue, { global: { stubs: { teleport: true } } })
  wrapper.findComponent(DialogueInputBar).vm.$emit('update:chatMode', 'normal')
  await flushPromises()
  return { wrapper, session }
}

function currentCall() {
  return vi.mocked(chatStream).mock.calls.at(-1)!
}

describe('server managed conversation lifecycle', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.mocked(getSuggestions).mockResolvedValue({
      suggestions: Array.from({ length: 12 }, (_, index) => `推荐问题${index}`),
      source: 'ai',
    })
    vi.mocked(getAttachmentCapabilities).mockResolvedValue(attachmentCapabilities)
    setActivePinia(createPinia())
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    })
  })

  it('keeps history in place through streaming and resumes following for a new question or session', async () => {
    const { wrapper } = await mountDialogue()
    const list = wrapper.findComponent(MessageList)
    const scroll = list.get('.dlg-messages')
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
    const input = wrapper.findComponent(DialogueInputBar)
    input.vm.$emit('update:input', '下一问')
    input.vm.$emit('send')
    await flushPromises()
    expect(top).toBe(600)

    const stream = currentCall()[1]
    height = 1200
    stream.onChunk('开始回复')
    await flushPromises()
    expect(top).toBe(800)

    top = 760
    await scroll.trigger('scroll')
    height = 1400
    stream.onChunk('，继续补充')
    await flushPromises()
    expect(top).toBe(760)
    stream.onDone()
    await flushPromises()
    expect(top).toBe(760)

    input.vm.$emit('update:input', '新的问题')
    input.vm.$emit('send')
    await flushPromises()
    expect(top).toBe(1000)
    currentCall()[1].onChunk('新的回答')
    currentCall()[1].onDone()
    await flushPromises()

    top = 600
    await scroll.trigger('scroll')
    input.vm.$emit('update:chatMode', 'socratic')
    await flushPromises()
    expect(top).toBe(1000)
    wrapper.unmount()
  })

  it('dismisses model errors while keeping the user bubble retry usable without duplicating the question', async () => {
    vi.useFakeTimers()
    let wrapper: Awaited<ReturnType<typeof mountDialogue>>['wrapper'] | undefined
    try {
      const mounted = await mountDialogue()
      wrapper = mounted.wrapper
      const input = wrapper.findComponent(DialogueInputBar)
      input.vm.$emit('update:input', '下一问')
      input.vm.$emit('send')
      await flushPromises()
      const first = currentCall()
      first[1].onMsgIds?.(13, 14)
      first[1].onError({
        code: 'AI_STREAM_ERROR',
        message: '模型服务暂时不可用，请重试',
        retryable: true,
      })
      await flushPromises()
      const list = wrapper.findComponent(MessageList)
      expect(wrapper.get('.ui-toast').text()).toContain('模型服务暂时不可用')
      expect(wrapper.find('.chat-error').exists()).toBe(false)
      expect(list.get('[data-message-index="3"] .msg-actions').classes()).toContain('visible')
      expect(
        list.get('[data-message-index="3"] button[aria-label="重试"]').find('svg').exists(),
      ).toBe(true)
      expect(list.props('messages')).toHaveLength(4)
      await vi.advanceTimersByTimeAsync(4000)
      expect(wrapper.find('.ui-toast').exists()).toBe(false)
      input.vm.$emit('update:input', '未发送的草稿')
      await list.get('button[aria-label="重试"]').trigger('click')
      const retry = currentCall()
      expect(retry[0]).toMatchObject({ userInput: '下一问', regenerateMessageId: 14 })
      expect(retry[0].requestId).not.toBe(first[0].requestId)
      expect(list.find('button[aria-label="重试"]').exists()).toBe(false)
      expect(input.props('input')).toBe('未发送的草稿')
      retry[1].onMsgIds?.(13, 15)
      retry[1].onChunk('恢复后的回答')
      retry[1].onDone()
      await flushPromises()
      expect(list.props('messages').at(-1)?.text).toBe('恢复后的回答')
      expect(list.props('messages').filter((message) => message.text === '下一问')).toHaveLength(1)
      expect(list.find('button[aria-label="重试"]').exists()).toBe(false)
    } finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('keeps the failed user request retryable when recovery confirms it was never accepted', async () => {
    vi.mocked(getChatRequestState).mockRejectedValueOnce({ response: { status: 404 } })
    const { wrapper } = await mountDialogue()
    const input = wrapper.findComponent(DialogueInputBar)
    input.vm.$emit('update:input', '下一问')
    input.vm.$emit('send')
    await flushPromises()
    const first = currentCall()
    first[1].onError(new TypeError('Failed to fetch'))
    await flushPromises()
    expect(getChatRequestState).toHaveBeenCalledWith(first[0].requestId)
    expect(wrapper.get('.ui-toast').text()).toContain('请重试')
    await wrapper.get('[data-message-index="3"] button[aria-label="重试"]').trigger('click')
    expect(currentCall()[0].requestId).toBe(first[0].requestId)
    expect(currentCall()[0].userInput).toBe('下一问')
    expect(wrapper.findComponent(MessageList).props('messages')).toHaveLength(4)
    currentCall()[1].onError(new Error('停止测试'))
    wrapper.unmount()
  })

  it('uses ids discovered during failed request recovery to retry the same question', async () => {
    vi.mocked(getChatRequestState).mockResolvedValueOnce({
      request_id: 'recover',
      status: 'failed',
      msg_ids: { user: 13, ai: 14 },
      error: { message: '模型暂时不可用', retryable: true },
    })
    const { wrapper, session } = await mountDialogue()
    const input = wrapper.findComponent(DialogueInputBar)
    input.vm.$emit('update:input', '下一问')
    input.vm.$emit('send')
    await flushPromises()
    const first = currentCall()
    const stored = {
      node_key: 'normal',
      mode: 'normal',
      topic_id: null,
      session_id: session.id,
      message_type: 'chat' as const,
      attachments: [],
      metadata: null,
      created_at: new Date(Date.now() + 1000).toISOString(),
    }
    vi.mocked(getAllMessages).mockResolvedValueOnce([
      { ...stored, id: 13, role: 'user', content: '下一问' },
      {
        ...stored,
        id: 14,
        role: 'ai',
        content: '',
        metadata: { status: 'failed', user_message_id: 13 },
      },
    ])
    first[1].onError({ code: 'CHAT_STREAM_DISCONNECTED', message: '连接中断' })
    await flushPromises()
    const list = wrapper.findComponent(MessageList)
    const messageCount = list.props('messages').length
    await wrapper.get('button[aria-label="重试"]').trigger('click')
    expect(currentCall()[0].regenerateMessageId).toBe(14)
    expect(currentCall()[0].requestId).not.toBe(first[0].requestId)
    currentCall()[1].onMsgIds?.(13, 15)
    currentCall()[1].onChunk('恢复后的回答')
    currentCall()[1].onDone()
    await flushPromises()
    expect(list.props('messages')).toHaveLength(messageCount)
    expect(list.props('messages').find((message) => message.db_id === 14)).toBeUndefined()
    expect(list.props('messages').filter((message) => message.db_id === 15)).toHaveLength(1)
    expect(list.props('messages').filter((message) => message.db_id === 13)).toHaveLength(1)
    wrapper.unmount()
  })

  it('clears the toast and user retry when starting another session', async () => {
    const { wrapper } = await mountDialogue()
    const input = wrapper.findComponent(DialogueInputBar)
    input.vm.$emit('update:input', '下一问')
    input.vm.$emit('send')
    await flushPromises()
    currentCall()[1].onError(new Error('模型服务暂不可用'))
    await flushPromises()
    expect(wrapper.find('.ui-toast').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="重试"]').exists()).toBe(true)
    await wrapper.get('button[title="新建对话"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.ui-toast').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="重试"]').exists()).toBe(false)
    expect(chatStream).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('sends attachment-only messages and freezes their ids across a network retry and later regeneration', async () => {
    vi.mocked(uploadAttachment).mockResolvedValue(attachment())
    const { wrapper } = await mountDialogue()
    const input = wrapper.findComponent(DialogueInputBar)
    input.vm.$emit('addAttachments', [new File(['a'], 'a.pdf')])
    await flushPromises()
    input.vm.$emit('send')
    await flushPromises()
    const first = currentCall()
    expect(first[0]).toMatchObject({ userInput: '', attachmentIds: ['attachment-1'] })
    expect(wrapper.findComponent(MessageList).props('messages').at(-1)).toMatchObject({
      role: 'user',
      text: '',
      attachments: [{ id: 'attachment-1' }],
    })
    first[1].onError(new Error('暂时断开'))
    await flushPromises()
    await wrapper.get('button[aria-label="重试"]').trigger('click')
    const retry = currentCall()
    expect(retry[0].attachmentIds).toEqual(['attachment-1'])
    expect(retry[0].requestId).toBe(first[0].requestId)
    retry[1].onMsgIds?.(13, 14)
    retry[1].onChunk('根据附件回答')
    retry[1].onDone()
    await flushPromises()
    expect(input.props('attachments')).toHaveLength(0)
    wrapper.findComponent(MessageList).vm.$emit('retry', 4)
    await flushPromises()
    expect(currentCall()[0]).toMatchObject({
      regenerateMessageId: 14,
      attachmentIds: ['attachment-1'],
      userInput: '',
    })
    wrapper.unmount()
  })

  it('sends images without requiring visual capability or token settings', async () => {
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL = vi.fn(() => 'blob:test')
        static revokeObjectURL = vi.fn()
      },
    )
    vi.mocked(uploadAttachment).mockResolvedValue(attachment({ kind: 'image', name: 'a.png' }))
    const { wrapper } = await mountDialogue()
    const input = wrapper.findComponent(DialogueInputBar)
    input.vm.$emit('addAttachments', [new File(['a'], 'a.png', { type: 'image/png' })])
    await flushPromises()
    input.vm.$emit('send')
    await flushPromises()
    expect(chatStream).toHaveBeenCalledTimes(1)
    expect(currentCall()[0]).toMatchObject({ attachmentIds: ['attachment-1'] })
    expect(wrapper.text()).not.toContain('尚未启用图片输入')
    currentCall()[1].onMsgIds?.(13, 14)
    currentCall()[1].onChunk('看图回答')
    currentCall()[1].onDone()
    await flushPromises()
    expect(input.props('attachments')).toHaveLength(0)
    wrapper.unmount()
    vi.unstubAllGlobals()
  })

  it('polls an accepted request after disconnection without starting a second generation', async () => {
    vi.mocked(getChatRequestState).mockResolvedValue({
      request_id: 'placeholder',
      status: 'generating',
      preparation: { completed: 1, total: 3 },
      msg_ids: { user: 13, ai: 14 },
    })
    const { wrapper } = await mountDialogue()
    const input = wrapper.findComponent(DialogueInputBar)
    input.vm.$emit('update:input', '总结资料')
    input.vm.$emit('send')
    await flushPromises()
    const first = currentCall()
    first[1].onError({ code: 'CHAT_STREAM_DISCONNECTED', message: '断开' })
    await flushPromises()
    expect(getChatRequestState).toHaveBeenCalledWith(first[0].requestId)
    expect(chatStream).toHaveBeenCalledTimes(1)
    expect(wrapper.get('.dlg-sub').text()).toBe('正在思考…')
    expect(wrapper.text()).not.toContain('正在整理资料')
    expect(wrapper.text()).not.toContain('1/3')
    expect(input.props('isThinking')).toBe(true)
    expect(wrapper.get('.ui-toast').text()).toBe('断开')
    expect(wrapper.find('button[aria-label="重试"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('hides the original answer immediately throughout regeneration and reuses its question', async () => {
    const { wrapper } = await mountDialogue()
    const list = wrapper.findComponent(MessageList)
    list.vm.$emit('retry', 2)
    await flushPromises()
    const call = currentCall()
    expect(call[0].regenerateMessageId).toBe(11)
    expect(call[0].requestId).toMatch(/^[\da-f-]{36}$/)
    expect(list.props('messages').filter((message) => message.role === 'user')).toHaveLength(1)
    expect(list.props('messages')[2].text).toBe('原回答')
    expect(list.text()).not.toContain('原回答')
    expect(list.findAll('.thinking-bubble')).toHaveLength(1)
    call[1].onMsgIds?.(10, 12)
    await flushPromises()
    expect(list.text()).not.toContain('原回答')
    call[1].onChunk('新回答')
    await flushPromises()
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await flushPromises()
    expect(list.text()).not.toContain('原回答')
    expect(list.text()).toContain('新回答')
    expect(list.findAll('.msg-row.ai')).toHaveLength(2) // Welcome and the new stream.
    call[1].onDone()
    await flushPromises()
    expect(list.props('messages').map((message) => message.text)).toContain('新回答')
    expect(list.props('messages').map((message) => message.text)).not.toContain('原回答')
    expect(list.props('messages')[2].db_id).toBe(12)
    wrapper.unmount()
    expect(cancelChatStream).not.toHaveBeenCalled()
  })

  it('updates recommendations after three more completed rounds and skips regeneration', async () => {
    const { wrapper } = await mountDialogue()
    const input = wrapper.findComponent(DialogueInputBar)
    const list = wrapper.findComponent(MessageList)
    expect(getSuggestions).toHaveBeenCalledTimes(1)
    const originalChips = [...input.props('chips')]

    for (const turn of [2, 3]) {
      input.vm.$emit('update:input', `第${turn}问`)
      input.vm.$emit('send')
      await flushPromises()
      expect(input.props('chips')).toEqual(originalChips)
      currentCall()[1].onMsgIds?.(turn * 10, turn * 10 + 1)
      currentCall()[1].onChunk(`第${turn}答`)
      currentCall()[1].onDone()
      await flushPromises()
      expect(getSuggestions).toHaveBeenCalledTimes(1)
      expect(input.props('chips')).toEqual(originalChips)
    }

    list.vm.$emit('retry', list.props('messages').length - 1)
    await flushPromises()
    currentCall()[1].onMsgIds?.(30, 32)
    currentCall()[1].onChunk('重新生成的第三答')
    currentCall()[1].onDone()
    await flushPromises()
    expect(getSuggestions).toHaveBeenCalledTimes(1)

    const nextChips = Array.from({ length: 12 }, (_, index) => `更新后的问题${index}`)
    vi.mocked(getSuggestions).mockResolvedValue({ suggestions: nextChips, source: 'ai' })
    input.vm.$emit('update:input', '第四问')
    input.vm.$emit('send')
    await flushPromises()
    expect(getSuggestions).toHaveBeenCalledTimes(1)
    currentCall()[1].onChunk('第四答')
    currentCall()[1].onDone()
    await flushPromises()
    expect(getSuggestions).toHaveBeenCalledTimes(2)
    expect(input.props('chips')).toEqual(nextChips)
    wrapper.unmount()
  })

  it('preserves the original answer after regeneration fails and retries the failed generation', async () => {
    const { wrapper } = await mountDialogue()
    wrapper.findComponent(MessageList).vm.$emit('retry', 2)
    await flushPromises()
    const first = currentCall()
    first[1].onMsgIds?.(10, 12)
    first[1].onError(new Error('上下文过长'))
    await flushPromises()
    expect(wrapper.findComponent(MessageList).props('messages')[2].text).toBe('原回答')
    expect(wrapper.findComponent(MessageList).text()).toContain('原回答')
    expect(wrapper.get('.ui-toast').text()).toContain('上下文过长')
    await wrapper.get('button[aria-label="重试"]').trigger('click')
    const retry = currentCall()
    expect(retry[0].requestId).not.toBe(first[0].requestId)
    expect(retry[0].regenerateMessageId).toBe(12)
    retry[1].onError(new Error('停止测试'))
    wrapper.unmount()
  })

  it('reuses the request id when the network outcome is unknown', async () => {
    const { wrapper } = await mountDialogue()
    const input = wrapper.findComponent(DialogueInputBar)
    input.vm.$emit('update:input', '下一问')
    input.vm.$emit('send')
    await flushPromises()
    const first = currentCall()
    first[1].onError(new Error('连接中断'))
    await flushPromises()
    await wrapper.get('button[aria-label="重试"]').trigger('click')
    const retry = currentCall()
    expect(retry[0].requestId).toBe(first[0].requestId)
    expect(
      wrapper
        .findComponent(MessageList)
        .props('messages')
        .filter((message) => message.text === '下一问'),
    ).toHaveLength(1)
    retry[1].onError(new Error('停止测试'))
    wrapper.unmount()
  })

  it('stops the server request and retains the original answer while regeneration is interrupted', async () => {
    const { wrapper, session } = await mountDialogue()
    wrapper.findComponent(MessageList).vm.$emit('retry', 2)
    await flushPromises()
    const call = currentCall()
    call[1].onMsgIds?.(10, 12)
    call[1].onChunk('未完成的新回答')
    wrapper.findComponent(DialogueInputBar).vm.$emit('abort')
    await flushPromises()
    expect(cancelChatStream).toHaveBeenCalledWith(session.id, call[0].requestId)
    expect(call[0].controller?.signal.aborted).toBe(true)
    expect(wrapper.findComponent(MessageList).props('messages')[2].text).toBe('原回答')
    expect(wrapper.findComponent(MessageList).props('messages')).toHaveLength(3)
    call[1].onChunk('迟到的片段')
    call[1].onDone()
    await flushPromises()
    expect(wrapper.findComponent(MessageList).props('messages')[2].text).toBe('原回答')
    wrapper.unmount()
  })

  it('replaces an interrupted partial answer when its retry succeeds', async () => {
    const { wrapper } = await mountDialogue()
    const input = wrapper.findComponent(DialogueInputBar)
    input.vm.$emit('update:input', '下一问')
    input.vm.$emit('send')
    await flushPromises()
    const first = currentCall()
    first[1].onMsgIds?.(13, 14)
    first[1].onChunk('部分回答')
    input.vm.$emit('abort')
    await flushPromises()
    expect(wrapper.findComponent(MessageList).props('messages').at(-1)?.text).toBe('部分回答')
    await wrapper.get('button[aria-label="重试"]').trigger('click')
    const retry = currentCall()
    expect(retry[0].regenerateMessageId).toBe(14)
    retry[1].onMsgIds?.(13, 15)
    retry[1].onChunk('完整回答')
    retry[1].onDone()
    await flushPromises()
    const messages = wrapper.findComponent(MessageList).props('messages')
    expect(messages.map((message) => message.text)).not.toContain('部分回答')
    expect(messages.at(-1)?.text).toBe('完整回答')
    expect(messages).toHaveLength(5)
    wrapper.unmount()
  })

  it('keeps the old answer and offers retry when completion contains no text', async () => {
    const { wrapper } = await mountDialogue()
    wrapper.findComponent(MessageList).vm.$emit('retry', 2)
    await flushPromises()
    const call = currentCall()
    call[1].onMsgIds?.(10, 12)
    call[1].onDone()
    await flushPromises()
    expect(wrapper.findComponent(MessageList).props('messages')[2].text).toBe('原回答')
    expect(wrapper.get('.ui-toast').text()).toContain('未返回可用的回答')
    expect(wrapper.get('button[aria-label="重试"]').find('svg').exists()).toBe(true)
    wrapper.unmount()
  })

  it.each(['failure', 'empty', 'abort'] as const)(
    'does not save a source-only reply after %s and retries the persisted question',
    async (outcome) => {
      const { wrapper } = await mountDialogue()
      const input = wrapper.findComponent(DialogueInputBar)
      input.vm.$emit('update:input', '下一问')
      input.vm.$emit('send')
      await flushPromises()
      const first = currentCall()
      first[1].onMsgIds?.(13, 14)
      first[1].onWebEvent?.({
        type: 'web_status',
        request_id: first[0].requestId,
        ai_message_id: 14,
        status: 'skipped',
        web: webSnapshot({ status: 'skipped', sources: [] }),
      })
      first[1].onChunk(' \n ')
      await flushPromises()
      expect(wrapper.findAll('.thinking-bubble .dot')).toHaveLength(3)
      if (outcome === 'failure')
        first[1].onError({ code: 'AI_STREAM_ERROR', message: '模型服务暂不可用', retryable: true })
      else if (outcome === 'empty') first[1].onDone()
      else input.vm.$emit('abort')
      await flushPromises()
      const list = wrapper.findComponent(MessageList)
      expect(list.props('messages')).toHaveLength(4)
      expect(wrapper.text()).not.toContain('本次无需联网')
      expect(wrapper.find('.thinking-bubble').exists()).toBe(false)
      await wrapper.get('button[aria-label="重试"]').trigger('click')
      const retry = currentCall()
      expect(retry[0].regenerateMessageId).toBe(14)
      expect(list.findAll('.thinking-bubble')).toHaveLength(1)
      retry[1].onMsgIds?.(13, 15)
      retry[1].onChunk('恢复后的回答')
      retry[1].onDone()
      await flushPromises()
      expect(list.props('messages')).toHaveLength(5)
      expect(list.props('messages').at(-1)?.text).toBe('恢复后的回答')
      expect(list.props('messages').filter((message) => message.text === '下一问')).toHaveLength(1)
      wrapper.unmount()
    },
  )

  it('ignores late callbacks after a reply has already finished', async () => {
    const { wrapper } = await mountDialogue()
    const input = wrapper.findComponent(DialogueInputBar)
    input.vm.$emit('update:input', '下一问')
    input.vm.$emit('send')
    await flushPromises()
    const call = currentCall()
    call[1].onMsgIds?.(13, 14)
    call[1].onChunk('完整回答')
    call[1].onDone()
    call[1].onChunk('迟到的文本')
    call[1].onWebEvent?.({
      type: 'web_status',
      request_id: call[0].requestId,
      ai_message_id: 14,
      status: 'searching',
      web: webSnapshot({ status: 'searching', sources: [] }),
    })
    call[1].onError(new Error('迟到的错误'))
    call[1].onDone()
    await flushPromises()
    const list = wrapper.findComponent(MessageList)
    expect(list.props('messages')).toHaveLength(5)
    expect(list.props('messages').at(-1)?.text).toBe('完整回答')
    expect(list.props('streamingText')).toBe('')
    expect(list.props('streamingWeb')).toBeUndefined()
    expect(wrapper.find('.ui-toast').exists()).toBe(false)
    wrapper.unmount()
  })

  it.each(['complete', 'abort'] as const)(
    'restores a disconnected partial reply once and clears the live row after %s',
    async (outcome) => {
      vi.useFakeTimers()
      let wrapper: Awaited<ReturnType<typeof mountDialogue>>['wrapper'] | undefined
      try {
        vi.mocked(getChatRequestState)
          .mockResolvedValueOnce({
            request_id: 'recover',
            status: 'generating',
            msg_ids: { user: 13, ai: 14 },
          })
          .mockResolvedValueOnce({ request_id: 'recover', status: 'complete' })
        const mounted = await mountDialogue()
        wrapper = mounted.wrapper
        const input = wrapper.findComponent(DialogueInputBar)
        input.vm.$emit('update:input', '下一问')
        input.vm.$emit('send')
        await flushPromises()
        const call = currentCall()
        call[1].onMsgIds?.(13, 14)
        call[1].onChunk('部分回答')
        call[1].onError({ code: 'CHAT_STREAM_DISCONNECTED', message: '连接中断' })
        await flushPromises()
        const list = wrapper.findComponent(MessageList)
        expect(list.props('streamingMessageId')).toBe(14)
        expect(list.props('streamingText')).toBe('部分回答')
        expect(list.find('[data-message-index="4"]').exists()).toBe(false)
        expect(list.find('.thinking-bubble').exists()).toBe(false)
        call[1].onChunk('迟到的片段')
        call[1].onDone()
        await flushPromises()
        expect(list.props('streamingText')).toBe('部分回答')
        expect(chatStream).toHaveBeenCalledTimes(1)
        if (outcome === 'abort') {
          input.vm.$emit('abort')
          await flushPromises()
          expect(list.props('isThinking')).toBe(false)
          expect(list.props('streamingText')).toBe('')
          expect(list.props('messages').filter((message) => message.db_id === 14)).toHaveLength(1)
          expect(list.props('messages').at(-1)?.text).toBe('部分回答')
          return
        }
        const stored = {
          node_key: 'normal',
          mode: 'normal',
          topic_id: null,
          session_id: mounted.session.id,
          message_type: 'chat' as const,
          created_at: '2026-01-01T00:00:03Z',
        }
        vi.mocked(getAllMessages).mockResolvedValue([
          { ...stored, id: 13, role: 'user', content: '下一问', metadata: null },
          {
            ...stored,
            id: 14,
            role: 'ai',
            content: '服务端完整回答',
            metadata: { status: 'complete', user_message_id: 13 },
          },
        ])
        await vi.advanceTimersByTimeAsync(2000)
        await flushPromises()
        expect(list.props('isThinking')).toBe(false)
        expect(list.props('streamingText')).toBe('')
        expect(list.props('streamingMessageId')).toBeUndefined()
        expect(list.props('messages').find((message) => message.db_id === 14)).toMatchObject({
          text: '服务端完整回答',
          metadata: { status: 'complete' },
        })
        expect(list.findAll('[data-message-index] .bubble.ai')).toHaveLength(2)
      } finally {
        wrapper?.unmount()
        vi.useRealTimers()
        vi.mocked(getChatRequestState).mockReset()
        vi.mocked(getAllMessages).mockResolvedValue([])
      }
    },
  )

  it('retries a busy request with the same id and frozen model selection', async () => {
    const { wrapper } = await mountDialogue()
    localStorage.setItem('sm_llm_model', 'model-original')
    const input = wrapper.findComponent(DialogueInputBar)
    input.vm.$emit('update:input', '下一问')
    input.vm.$emit('send')
    await flushPromises()
    const first = currentCall()
    first[1].onError({ code: 'CHAT_SESSION_BUSY', message: '会话忙，请稍后重试', retryable: false })
    await flushPromises()
    localStorage.setItem('sm_llm_model', 'model-changed')
    await wrapper.get('button[aria-label="重试"]').trigger('click')
    const retry = currentCall()
    expect(retry[0].requestId).toBe(first[0].requestId)
    expect(retry[0].modelId).toBe('model-original')
    retry[1].onError(new Error('停止测试'))
    wrapper.unmount()
  })

  it('keeps the persisted user id after capacity rejection and asks for editing instead of retrying', async () => {
    const { wrapper } = await mountDialogue()
    const input = wrapper.findComponent(DialogueInputBar)
    input.vm.$emit('update:input', '过长的问题')
    input.vm.$emit('send')
    await flushPromises()
    const call = currentCall()
    call[1].onMsgIds?.(13, 14)
    call[1].onError({
      code: 'CHAT_CONTEXT_TOO_LARGE',
      message: '请缩小引用范围或拆分输入',
      retryable: false,
    })
    await flushPromises()
    expect(wrapper.findComponent(MessageList).props('messages').at(-1)?.db_id).toBe(13)
    expect(wrapper.get('.ui-toast').text()).toContain('拆分输入')
    expect(wrapper.find('button[aria-label="重试"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('sends cancellation even before early ids arrive and ignores their late delivery', async () => {
    const { wrapper, session } = await mountDialogue()
    const input = wrapper.findComponent(DialogueInputBar)
    input.vm.$emit('update:input', '下一问')
    input.vm.$emit('send')
    await flushPromises()
    const call = currentCall()
    input.vm.$emit('abort')
    await flushPromises()
    expect(cancelChatStream).toHaveBeenCalledWith(session.id, call[0].requestId)
    call[1].onMsgIds?.(13, 14)
    call[1].onChunk('迟到的回答')
    call[1].onDone()
    await flushPromises()
    expect(wrapper.findComponent(MessageList).props('messages').at(-1)?.text).toBe('下一问')
    expect(wrapper.findComponent(MessageList).props('messages').at(-1)?.db_id).toBeUndefined()
    wrapper.unmount()
  })

  it('uses ids returned by cancellation to retry the original question without duplicating it', async () => {
    const { wrapper } = await mountDialogue()
    const input = wrapper.findComponent(DialogueInputBar)
    input.vm.$emit('update:input', '下一问')
    input.vm.$emit('send')
    await flushPromises()
    const first = currentCall()
    vi.mocked(cancelChatStream).mockResolvedValueOnce({
      status: 'interrupted',
      msg_ids: { user: 13, ai: 14 },
    })
    input.vm.$emit('abort')
    await flushPromises()
    expect(wrapper.findComponent(MessageList).props('messages').at(-1)?.db_id).toBe(13)
    await wrapper.get('button[aria-label="重试"]').trigger('click')
    const retry = currentCall()
    expect(retry[0].requestId).not.toBe(first[0].requestId)
    expect(retry[0].regenerateMessageId).toBe(14)
    retry[1].onError(new Error('停止测试'))
    wrapper.unmount()
  })

  it('uses a new request after cancellation confirms an unaccepted request', async () => {
    const { wrapper } = await mountDialogue()
    const input = wrapper.findComponent(DialogueInputBar)
    input.vm.$emit('update:input', '下一问')
    input.vm.$emit('send')
    await flushPromises()
    const first = currentCall()
    vi.mocked(cancelChatStream).mockResolvedValueOnce({ status: 'interrupted' })
    input.vm.$emit('abort')
    await flushPromises()
    await wrapper.get('button[aria-label="重试"]').trigger('click')
    const retry = currentCall()
    expect(retry[0].requestId).not.toBe(first[0].requestId)
    expect(retry[0].regenerateMessageId).toBeUndefined()
    retry[1].onError(new Error('停止测试'))
    wrapper.unmount()
  })

  it('keeps a generic waiting hint without exposing internal preparation or search stages', async () => {
    const { wrapper } = await mountDialogue()
    const input = wrapper.findComponent(DialogueInputBar)
    input.vm.$emit('update:input', '下一问')
    input.vm.$emit('send')
    await flushPromises()
    const call = currentCall()
    expect(wrapper.get('.dlg-sub').text()).toBe('正在思考…')
    call[1].onContextStatus?.('compacting')
    await flushPromises()
    expect(wrapper.get('.dlg-sub').text()).toBe('正在思考…')
    expect(wrapper.text()).not.toContain('正在整理较早的对话')
    call[1].onContextStatus?.('ready')
    await flushPromises()
    expect(wrapper.get('.dlg-sub').text()).toBe('正在思考…')
    call[1].onMsgIds?.(13, 14)
    for (const status of ['deciding', 'searching'] as const) {
      call[1].onWebEvent?.({
        type: 'web_status',
        request_id: call[0].requestId,
        ai_message_id: 14,
        status,
        web: webSnapshot({ status }),
      })
      await flushPromises()
      expect(wrapper.get('.dlg-sub').text()).toBe('正在思考…')
      expect(wrapper.find('.thinking-bubble').exists()).toBe(true)
      expect(wrapper.find('.message-sources').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('正在判断是否需要联网')
      expect(wrapper.text()).not.toContain('正在搜索资料')
    }
    call[1].onContextStatus?.('compacting')
    call[1].onChunk('回答')
    await flushPromises()
    expect(wrapper.get('.dlg-sub').text()).toBe('正在思考…')
    input.vm.$emit('abort')
    await flushPromises()
    call[1].onContextStatus?.('compacting')
    await flushPromises()
    expect(wrapper.get('.dlg-sub').text()).not.toContain('正在整理')
    wrapper.unmount()
  })

  it('keeps the partial answer after an incomplete stream and replaces it on regeneration', async () => {
    const { wrapper } = await mountDialogue()
    const input = wrapper.findComponent(DialogueInputBar)
    input.vm.$emit('update:input', '下一问')
    input.vm.$emit('send')
    await flushPromises()
    const first = currentCall()
    first[1].onMsgIds?.(13, 14)
    first[1].onChunk('未完成的回答')
    first[1].onError({
      code: 'AI_STREAM_INCOMPLETE',
      message: '回答尚未完成，请重新生成',
      retryable: true,
    })
    await flushPromises()
    const list = wrapper.findComponent(MessageList)
    expect(list.props('messages').at(-1)).toMatchObject({
      text: '未完成的回答',
      metadata: { status: 'interrupted' },
      db_id: 14,
    })
    expect(list.text()).toContain('未完成')
    await wrapper.get('button[aria-label="重试"]').trigger('click')
    const retry = currentCall()
    expect(retry[0].regenerateMessageId).toBe(14)
    retry[1].onMsgIds?.(13, 15)
    retry[1].onChunk('完整回答')
    retry[1].onDone()
    await flushPromises()
    expect(list.props('messages').at(-1)?.text).toBe('完整回答')
    expect(list.props('messages').map((message) => message.text)).not.toContain('未完成的回答')
    expect(list.props('messages')).toHaveLength(5)
    wrapper.unmount()
  })

  it('retains output-limited text and lets the user continue with a new question', async () => {
    const { wrapper } = await mountDialogue()
    const input = wrapper.findComponent(DialogueInputBar)
    input.vm.$emit('update:input', '下一问')
    input.vm.$emit('send')
    await flushPromises()
    const first = currentCall()
    first[1].onMsgIds?.(13, 14)
    first[1].onChunk('未完成的回答')
    first[1].onError({ code: 'AI_OUTPUT_LIMIT', message: '输出达到上限', retryable: false })
    await flushPromises()
    const list = wrapper.findComponent(MessageList)
    expect(list.props('messages').at(-1)).toMatchObject({
      text: '未完成的回答',
      metadata: { status: 'interrupted' },
    })
    expect(wrapper.get('.ui-toast').text()).toContain('可输入“继续”')
    expect(wrapper.find('button[aria-label="重试"]').exists()).toBe(false)
    input.vm.$emit('update:input', '继续')
    input.vm.$emit('send')
    await flushPromises()
    const continuation = currentCall()
    expect(continuation[0].userInput).toBe('继续')
    expect(continuation[0].requestId).not.toBe(first[0].requestId)
    expect(continuation[0].regenerateMessageId).toBeUndefined()
    continuation[1].onError(new Error('停止测试'))
    wrapper.unmount()
  })

  it('keeps the original reply when a replacement hits the output limit', async () => {
    const { wrapper } = await mountDialogue()
    const list = wrapper.findComponent(MessageList)
    list.vm.$emit('retry', 2)
    await flushPromises()
    const call = currentCall()
    call[1].onMsgIds?.(10, 12)
    call[1].onChunk('未完成的新回答')
    call[1].onError({ code: 'AI_OUTPUT_LIMIT', message: '输出达到上限', retryable: false })
    await flushPromises()
    expect(list.props('messages')[2].text).toBe('原回答')
    expect(list.props('messages')).toHaveLength(3)
    expect(wrapper.get('.ui-toast').text()).toContain('已保留原回答')
    wrapper.unmount()
  })

  it('waits for deletion confirmation and retains messages on deletion failure', async () => {
    const { wrapper } = await mountDialogue()
    let reject!: (error: Error) => void
    vi.mocked(deleteMessages).mockImplementationOnce(
      () =>
        new Promise((_, onReject) => {
          reject = onReject
        }),
    )
    const list = wrapper.findComponent(MessageList)
    list.vm.$emit('delete', 2)
    await flushPromises()
    expect(list.props('messages')[2].text).toBe('原回答')
    reject(new Error('暂时无法删除'))
    await flushPromises()
    expect(list.props('messages')[2].text).toBe('原回答')
    expect(wrapper.get('.ui-toast').text()).toContain('暂时无法删除')
    vi.mocked(deleteMessages).mockResolvedValueOnce(1)
    list.vm.$emit('delete', 2)
    await flushPromises()
    expect(list.props('messages')).toHaveLength(2)
    wrapper.unmount()
  })
  it('leaves networking to the backend when an unknown request is retried', async () => {
    const { wrapper } = await mountDialogue()
    const input = wrapper.findComponent(DialogueInputBar)
    expect(input.find('[aria-label="联网模式"]').exists()).toBe(false)
    input.vm.$emit('update:input', '新问题')
    input.vm.$emit('send')
    await flushPromises()
    const first = currentCall()
    expect(first[0]).not.toHaveProperty('webMode')
    first[1].onError(new Error('断网'))
    await flushPromises()
    await wrapper.get('button[aria-label="重试"]').trigger('click')
    expect(currentCall()[0].requestId).toBe(first[0].requestId)
    expect(currentCall()[0]).not.toHaveProperty('webMode')
    currentCall()[1].onError(new Error('停止'))
    wrapper.unmount()
  })

  it('keeps the original answer and sources on regeneration failure without a frontend search preference', async () => {
    const original = webSnapshot()
    const { wrapper } = await mountDialogue(original)
    const list = wrapper.findComponent(MessageList)
    list.vm.$emit('retry', 2)
    await flushPromises()
    const call = currentCall()
    expect(call[0]).not.toHaveProperty('webMode')
    call[1].onMsgIds?.(10, 12)
    call[1].onWebEvent?.({
      type: 'web_sources',
      request_id: call[0].requestId,
      ai_message_id: 12,
      web: webSnapshot({ sources: [] }),
      final: false,
    })
    call[1].onChunk('新的部分回答')
    call[1].onError(new Error('失败'))
    await flushPromises()
    expect(list.props('messages')[2].metadata?.web).toEqual(original)
    expect(list.props('messages')[2].text).toBe('原回答')
    wrapper.unmount()
  })

  it('retains web metadata and cited ids after interruption and discards late web events', async () => {
    const { wrapper } = await mountDialogue()
    const input = wrapper.findComponent(DialogueInputBar)
    input.vm.$emit('update:input', '最新情况')
    input.vm.$emit('send')
    await flushPromises()
    const call = currentCall()
    call[1].onMsgIds?.(13, 14)
    const event = {
      type: 'web_sources' as const,
      request_id: call[0].requestId,
      ai_message_id: 14,
      web: webSnapshot({ cited_source_ids: [] }),
      final: false,
    }
    call[1].onWebEvent?.(event)
    call[1].onChunk('部分回答 [[source:s1]]')
    input.vm.$emit('abort')
    call[1].onWebEvent?.({ ...event, web: webSnapshot({ status: 'failed', sources: [] }) })
    await flushPromises()
    const last = wrapper.findComponent(MessageList).props('messages').at(-1)!
    expect(last.metadata).toMatchObject({
      status: 'interrupted',
      web: { status: 'ready', cited_source_ids: ['s1'] },
    })
    expect(last.chatRequest).not.toHaveProperty('webMode')
    wrapper.unmount()
  })

  it('persists final sources on success and isolates web events after a session switch', async () => {
    const { wrapper } = await mountDialogue()
    const input = wrapper.findComponent(DialogueInputBar)
    input.vm.$emit('update:input', '最新情况')
    input.vm.$emit('send')
    await flushPromises()
    const call = currentCall()
    call[1].onMsgIds?.(13, 14)
    const event = {
      type: 'web_sources' as const,
      request_id: call[0].requestId,
      ai_message_id: 14,
      web: webSnapshot(),
      final: true,
    }
    call[1].onChunk('回答 [[source:s1]]')
    call[1].onWebEvent?.(event)
    call[1].onDone()
    await flushPromises()
    expect(wrapper.findComponent(MessageList).props('messages').at(-1)?.metadata?.web).toEqual(
      event.web,
    )
    input.vm.$emit('update:input', '下一轮')
    input.vm.$emit('send')
    await flushPromises()
    const running = currentCall()
    running[1].onMsgIds?.(15, 16)
    await wrapper.get('button[title="新建对话"]').trigger('click')
    running[1].onWebEvent?.({ ...event, request_id: running[0].requestId, ai_message_id: 16 })
    await flushPromises()
    expect(wrapper.findComponent(MessageList).props('streamingWeb')).toBeUndefined()
    wrapper.unmount()
  })

  it('shows search unavailability with the finished answer when reported by the backend', async () => {
    const { wrapper } = await mountDialogue()
    expect(wrapper.text()).not.toContain('联网暂不可用')
    const input = wrapper.findComponent(DialogueInputBar)
    input.vm.$emit('update:input', '最新情况')
    input.vm.$emit('send')
    await flushPromises()
    const call = currentCall()
    call[1].onMsgIds?.(13, 14)
    call[1].onWebEvent?.({
      type: 'web_warning',
      request_id: call[0].requestId,
      ai_message_id: 14,
      web: webSnapshot({ status: 'unavailable', sources: [], cited_source_ids: [] }),
      warning: { code: 'WEB_UNAVAILABLE', message: '当前无法核实最新资料。', retryable: true },
    })
    await flushPromises()
    expect(wrapper.findComponent(MessageList).text()).not.toContain('联网暂不可用')
    expect(wrapper.findComponent(MessageList).text()).not.toContain('当前无法核实最新资料')
    call[1].onChunk('目前无法核实最新情况。')
    call[1].onDone()
    await flushPromises()
    expect(wrapper.findComponent(MessageList).text()).toContain('联网暂不可用')
    expect(wrapper.findComponent(MessageList).text()).toContain('当前无法核实最新资料')
    expect(input.text()).not.toContain('联网暂不可用')
    wrapper.unmount()
  })
})
