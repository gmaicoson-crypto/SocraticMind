import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SocraticDialogue from '../SocraticDialogue.vue'
import DialogueInputBar from '../dialogue/DialogueInputBar.vue'
import MessageList from '../dialogue/MessageList.vue'
import { createDefaultSession } from '../../composables/useChatSessions'
import { cancelChatStream, chatStream, deleteMessages } from '../../api/chat'

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
vi.mock('../../api/models', () => ({
  getLLMModels: vi.fn().mockResolvedValue([]),
  createCustomModel: vi.fn(),
  updateCustomModel: vi.fn(),
  deleteCustomModel: vi.fn(),
}))

async function mountDialogue() {
  const session = createDefaultSession('normal')
  session.messages.push(
    { role: 'user', text: '原问题', time: '2026-01-01T00:00:01Z', db_id: 10 },
    { role: 'ai', text: '原回答', time: '2026-01-01T00:00:02Z', db_id: 11 },
  )
  localStorage.setItem('sm_normal_sessions', JSON.stringify([session]))
  localStorage.setItem('sm_normal_cur', session.id)
  const wrapper = mount(SocraticDialogue)
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
    setActivePinia(createPinia())
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    })
  })

  it('keeps the original answer until regeneration succeeds and reuses its question', async () => {
    const { wrapper } = await mountDialogue()
    const list = wrapper.findComponent(MessageList)
    list.vm.$emit('retry', 2)
    await flushPromises()
    const call = currentCall()
    expect(call[14]).toBe(11)
    expect(call[4]).toMatch(/^[\da-f-]{36}$/)
    expect(list.props('messages').filter((message) => message.role === 'user')).toHaveLength(1)
    expect(list.props('messages')[2].text).toBe('原回答')
    call[11]?.(10, 12)
    call[7]('新回答')
    call[8]()
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
    first[11]?.(10, 12)
    first[9](new Error('上下文过长'))
    await flushPromises()
    expect(wrapper.findComponent(MessageList).props('messages')[2].text).toBe('原回答')
    expect(wrapper.get('.chat-error').text()).toContain('上下文过长')
    await wrapper.get('.chat-error button').trigger('click')
    const retry = currentCall()
    expect(retry[4]).not.toBe(first[4])
    expect(retry[14]).toBe(12)
    retry[9](new Error('停止测试'))
    wrapper.unmount()
  })

  it('reuses the request id when the network outcome is unknown', async () => {
    const { wrapper } = await mountDialogue()
    const input = wrapper.findComponent(DialogueInputBar)
    input.vm.$emit('update:input', '下一问')
    input.vm.$emit('send')
    await flushPromises()
    const first = currentCall()
    first[9](new Error('连接中断'))
    await flushPromises()
    await wrapper.get('.chat-error button').trigger('click')
    const retry = currentCall()
    expect(retry[4]).toBe(first[4])
    expect(
      wrapper
        .findComponent(MessageList)
        .props('messages')
        .filter((message) => message.text === '下一问'),
    ).toHaveLength(1)
    retry[9](new Error('停止测试'))
    wrapper.unmount()
  })

  it('stops the server request and retains the original answer while regeneration is interrupted', async () => {
    const { wrapper, session } = await mountDialogue()
    wrapper.findComponent(MessageList).vm.$emit('retry', 2)
    await flushPromises()
    const call = currentCall()
    call[11]?.(10, 12)
    call[7]('未完成的新回答')
    wrapper.findComponent(DialogueInputBar).vm.$emit('abort')
    await flushPromises()
    expect(cancelChatStream).toHaveBeenCalledWith(session.id, call[4])
    expect(call[10]?.signal.aborted).toBe(true)
    expect(wrapper.findComponent(MessageList).props('messages')[2].text).toBe('原回答')
    expect(wrapper.findComponent(MessageList).props('messages')).toHaveLength(3)
    call[7]('迟到的片段')
    call[8]()
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
    first[11]?.(13, 14)
    first[7]('部分回答')
    input.vm.$emit('abort')
    await flushPromises()
    expect(wrapper.findComponent(MessageList).props('messages').at(-1)?.text).toBe('部分回答')
    await wrapper.get('.chat-error button').trigger('click')
    const retry = currentCall()
    expect(retry[14]).toBe(14)
    retry[11]?.(13, 15)
    retry[7]('完整回答')
    retry[8]()
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
    call[11]?.(10, 12)
    call[8]()
    await flushPromises()
    expect(wrapper.findComponent(MessageList).props('messages')[2].text).toBe('原回答')
    expect(wrapper.get('.chat-error').text()).toContain('未返回可用的回答')
    expect(wrapper.get('.chat-error button').text()).toBe('重试')
    wrapper.unmount()
  })

  it('retries a busy request with the same id and frozen model selection', async () => {
    const { wrapper } = await mountDialogue()
    localStorage.setItem('sm_llm_model', 'model-original')
    const input = wrapper.findComponent(DialogueInputBar)
    input.vm.$emit('update:input', '下一问')
    input.vm.$emit('send')
    await flushPromises()
    const first = currentCall()
    first[9]({ code: 'CHAT_SESSION_BUSY', message: '会话忙，请稍后重试', retryable: false })
    await flushPromises()
    localStorage.setItem('sm_llm_model', 'model-changed')
    await wrapper.get('.chat-error button').trigger('click')
    const retry = currentCall()
    expect(retry[4]).toBe(first[4])
    expect(retry[15]).toBe('model-original')
    retry[9](new Error('停止测试'))
    wrapper.unmount()
  })

  it('keeps the persisted user id after capacity rejection and asks for editing instead of retrying', async () => {
    const { wrapper } = await mountDialogue()
    const input = wrapper.findComponent(DialogueInputBar)
    input.vm.$emit('update:input', '过长的问题')
    input.vm.$emit('send')
    await flushPromises()
    const call = currentCall()
    call[11]?.(13, 14)
    call[9]({
      code: 'CHAT_CONTEXT_TOO_LARGE',
      message: '请缩小引用范围或拆分输入',
      retryable: false,
    })
    await flushPromises()
    expect(wrapper.findComponent(MessageList).props('messages').at(-1)?.db_id).toBe(13)
    expect(wrapper.get('.chat-error').text()).toContain('拆分输入')
    expect(wrapper.find('.chat-error button').exists()).toBe(false)
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
    expect(cancelChatStream).toHaveBeenCalledWith(session.id, call[4])
    call[11]?.(13, 14)
    call[7]('迟到的回答')
    call[8]()
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
    await wrapper.get('.chat-error button').trigger('click')
    const retry = currentCall()
    expect(retry[4]).not.toBe(first[4])
    expect(retry[14]).toBe(14)
    retry[9](new Error('停止测试'))
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
    await wrapper.get('.chat-error button').trigger('click')
    const retry = currentCall()
    expect(retry[4]).not.toBe(first[4])
    expect(retry[14]).toBeUndefined()
    retry[9](new Error('停止测试'))
    wrapper.unmount()
  })

  it('shows context preparation only while the current request needs it', async () => {
    const { wrapper } = await mountDialogue()
    const input = wrapper.findComponent(DialogueInputBar)
    input.vm.$emit('update:input', '下一问')
    input.vm.$emit('send')
    await flushPromises()
    const call = currentCall()
    expect(wrapper.get('.dlg-sub').text()).toBe('正在思考…')
    call[16]?.('compacting')
    await flushPromises()
    expect(wrapper.get('.dlg-sub').text()).toBe('正在整理较早的对话')
    call[16]?.('ready')
    await flushPromises()
    expect(wrapper.get('.dlg-sub').text()).toBe('正在思考…')
    call[16]?.('compacting')
    call[7]('回答')
    await flushPromises()
    expect(wrapper.get('.dlg-sub').text()).toBe('正在思考…')
    input.vm.$emit('abort')
    await flushPromises()
    call[16]?.('compacting')
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
    first[11]?.(13, 14)
    first[7]('未完成的回答')
    first[9]({ code: 'AI_STREAM_INCOMPLETE', message: '回答尚未完成，请重新生成', retryable: true })
    await flushPromises()
    const list = wrapper.findComponent(MessageList)
    expect(list.props('messages').at(-1)).toMatchObject({
      text: '未完成的回答',
      metadata: { status: 'interrupted' },
      db_id: 14,
    })
    expect(list.text()).toContain('未完成')
    await wrapper.get('.chat-error button').trigger('click')
    const retry = currentCall()
    expect(retry[14]).toBe(14)
    retry[11]?.(13, 15)
    retry[7]('完整回答')
    retry[8]()
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
    first[11]?.(13, 14)
    first[7]('未完成的回答')
    first[9]({ code: 'AI_OUTPUT_LIMIT', message: '输出达到上限', retryable: false })
    await flushPromises()
    const list = wrapper.findComponent(MessageList)
    expect(list.props('messages').at(-1)).toMatchObject({
      text: '未完成的回答',
      metadata: { status: 'interrupted' },
    })
    expect(wrapper.get('.chat-error').text()).toContain('可输入“继续”')
    expect(wrapper.find('.chat-error button').exists()).toBe(false)
    input.vm.$emit('update:input', '继续')
    input.vm.$emit('send')
    await flushPromises()
    const continuation = currentCall()
    expect(continuation[3]).toBe('继续')
    expect(continuation[4]).not.toBe(first[4])
    expect(continuation[14]).toBeUndefined()
    continuation[9](new Error('停止测试'))
    wrapper.unmount()
  })

  it('keeps the original reply when a replacement hits the output limit', async () => {
    const { wrapper } = await mountDialogue()
    const list = wrapper.findComponent(MessageList)
    list.vm.$emit('retry', 2)
    await flushPromises()
    const call = currentCall()
    call[11]?.(10, 12)
    call[7]('未完成的新回答')
    call[9]({ code: 'AI_OUTPUT_LIMIT', message: '输出达到上限', retryable: false })
    await flushPromises()
    expect(list.props('messages')[2].text).toBe('原回答')
    expect(list.props('messages')).toHaveLength(3)
    expect(wrapper.get('.chat-error').text()).toContain('已保留原回答')
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
    expect(wrapper.get('.chat-error').text()).toContain('暂时无法删除')
    vi.mocked(deleteMessages).mockResolvedValueOnce(1)
    list.vm.$emit('delete', 2)
    await flushPromises()
    expect(list.props('messages')).toHaveLength(2)
    wrapper.unmount()
  })
})
