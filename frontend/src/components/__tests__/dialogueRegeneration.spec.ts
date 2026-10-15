import { describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import DialogueInputBar from '../dialogue/DialogueInputBar.vue'
import MessageList from '../dialogue/MessageList.vue'
import { cancelChatStream } from '../../api/chat'
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

describe('chat answer regeneration and interruption', () => {
  setupDialogueContext()
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
})
