import { describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import DialogueInputBar from '../dialogue/DialogueInputBar.vue'
import MessageList from '../dialogue/MessageList.vue'
import { uploadAttachment } from '../../api/attachments'
import { attachment } from '../../test/fixtures/attachments'
import { chatStream, deleteMessages, getSuggestions } from '../../api/chat'
import { webSnapshot } from '../../test/fixtures/webSearch'
import { setupDialogueContext, mountDialogue, currentCall } from './dialogueContext.setup'

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

describe('chat history, attachments and evidence', () => {
  setupDialogueContext()
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
