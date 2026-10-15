import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import SocraticDialogue from '../SocraticDialogue.vue'
import DialogueHistoryPanel from '../dialogue/DialogueHistoryPanel.vue'
import { createDefaultSession } from '../../composables/useChatSessions'
import { useLearningStore } from '../../stores/learning'
import DialogueInputBar from '../dialogue/DialogueInputBar.vue'
import MessageList from '../dialogue/MessageList.vue'
import { cancelChatStream, chatStream, getAllMessages, getChatRequestState } from '../../api/chat'
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

vi.mock('../../api/sessionTitles', () => ({
  getSessionTitles: vi.fn().mockResolvedValue([]),
  requestSessionTitle: vi.fn(),
  renameSessionTitle: vi.fn(),
}))

describe('chat request recovery', () => {
  setupDialogueContext()

  function signIn() {
    useLearningStore().setUserInfo({
      id: 1,
      username: '学习者',
      email: 'learner@example.test',
      avatar_url: '',
      ai_avatar_url: '',
      bio: '',
      daily_goal: 5,
      ai_style: '标准',
    })
  }

  it.each(['reload', 'switch'] as const)(
    'restores a signed-in learning session after %s before accepting another question',
    async (entry) => {
      signIn()
      const session = createDefaultSession('socratic')
      const previous = createDefaultSession('socratic')
      localStorage.setItem('sm_socratic_sessions', JSON.stringify([session, previous]))
      localStorage.setItem('sm_socratic_cur', entry === 'reload' ? session.id : previous.id)
      localStorage.setItem('sm_pending_chat_requests', JSON.stringify({ [session.id]: 'pending' }))
      vi.mocked(getChatRequestState).mockResolvedValue({
        request_id: 'pending',
        session_id: session.id,
        status: 'generating',
        msg_ids: { user: 13, ai: 14 },
      })
      const wrapper = mount(SocraticDialogue, { global: { stubs: { teleport: true } } })
      try {
        await flushPromises()
        if (entry === 'switch') {
          wrapper.findComponent(DialogueHistoryPanel).vm.$emit('switch', session.id)
          await flushPromises()
        }
        expect(getChatRequestState).toHaveBeenCalledExactlyOnceWith('pending')
        expect(wrapper.findComponent(MessageList).props('isThinking')).toBe(true)
        expect(chatStream).not.toHaveBeenCalled()
      } finally {
        wrapper.unmount()
        vi.mocked(getChatRequestState).mockReset()
      }
    },
  )

  it('selects the target learning session before opening its node stream', async () => {
    signIn()
    const oldSession = createDefaultSession('socratic')
    Object.assign(oldSession, { topicId: 1, topicTitle: '旧主题', nodeKey: 'old-node' })
    const nextSession = createDefaultSession('socratic')
    Object.assign(nextSession, { topicId: 2, topicTitle: '新主题', nodeKey: 'new-node' })
    localStorage.setItem('sm_socratic_sessions', JSON.stringify([oldSession, nextSession]))
    localStorage.setItem('sm_socratic_cur', oldSession.id)
    const store = useLearningStore()
    store.topics = [
      { id: '1', title: '旧主题', emoji: '', nodes: 1, mastered: 0 },
      { id: '2', title: '新主题', emoji: '', nodes: 1, mastered: 0 },
    ]
    store.activeTopicId = '1'
    store.nodes = [{ id: 'old-node', label: '旧节点', sub: '', x: 0, y: 0, state: 'available' }]
    const wrapper = mount(SocraticDialogue, { global: { stubs: { teleport: true } } })
    try {
      await flushPromises()
      const node = {
        id: 'new-node',
        label: '新节点',
        sub: '',
        x: 0,
        y: 0,
        state: 'available' as const,
      }
      store.activeTopicId = '2'
      store.nodes = [node]
      store.requestNodeDialogue(node)
      await flushPromises()
      expect(chatStream).toHaveBeenCalledOnce()
      expect(currentCall()[0]).toMatchObject({
        sessionId: nextSession.id,
        topicId: 2,
        nodeKey: node.id,
      })
      expect(currentCall()[0].controller?.signal.aborted).toBe(false)
      expect(cancelChatStream).not.toHaveBeenCalled()
      expect(getChatRequestState).not.toHaveBeenCalled()
      expect(wrapper.findComponent(MessageList).props('isThinking')).toBe(true)
    } finally {
      wrapper.unmount()
    }
  })

  it('does not open a deferred node stream after unmount', async () => {
    const { wrapper } = await mountDialogue()
    const store = useLearningStore()
    const node = { id: 'node', label: '节点', sub: '', x: 0, y: 0, state: 'available' as const }
    store.nodes = [node]
    store.requestNodeDialogue(node)
    await nextTick()
    wrapper.unmount()
    await flushPromises()
    expect(chatStream).not.toHaveBeenCalled()
  })

  it.each(['abort', 'switch', 'unmount'] as const)(
    'ignores a recovery poll that completes after %s',
    async (exit) => {
      vi.useFakeTimers()
      let wrapper: Awaited<ReturnType<typeof mountDialogue>>['wrapper'] | undefined
      try {
        let completePoll!: (state: Awaited<ReturnType<typeof getChatRequestState>>) => void
        vi.mocked(getChatRequestState)
          .mockResolvedValueOnce({ request_id: 'recover', status: 'generating' })
          .mockImplementationOnce(
            () =>
              new Promise((resolve) => {
                completePoll = resolve
              }),
          )
        const mounted = await mountDialogue()
        wrapper = mounted.wrapper
        const input = wrapper.findComponent(DialogueInputBar)
        input.vm.$emit('update:input', '下一问')
        input.vm.$emit('send')
        await flushPromises()
        currentCall()[1].onError(new TypeError('Failed to fetch'))
        await flushPromises()
        expect(wrapper.findComponent(MessageList).props('isThinking')).toBe(true)
        await vi.advanceTimersByTimeAsync(2000)
        expect(getChatRequestState).toHaveBeenCalledTimes(2)
        if (exit === 'unmount') wrapper.unmount()
        else if (exit === 'switch') input.vm.$emit('update:chatMode', 'socratic')
        else input.vm.$emit('abort')
        await flushPromises()
        completePoll({ request_id: 'recover', status: 'generating' })
        await flushPromises()
        await vi.advanceTimersByTimeAsync(10000)
        expect(getChatRequestState).toHaveBeenCalledTimes(2)
        if (exit !== 'unmount') {
          const list = wrapper.findComponent(MessageList)
          expect(list.props('isThinking')).toBe(false)
          expect(list.props('streamingText')).toBe('')
        }
      } finally {
        wrapper?.unmount()
        vi.useRealTimers()
        vi.mocked(getChatRequestState).mockReset()
      }
    },
  )

  it.each(['confirmed', 'failed'] as const)(
    'keeps the new request recoverable after a late %s cancellation',
    async (outcome) => {
      let confirmCancellation!: () => void
      vi.mocked(cancelChatStream).mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            confirmCancellation = () =>
              outcome === 'confirmed'
                ? resolve({ status: 'interrupted' })
                : reject(new Error('旧取消请求失败'))
          }),
      )
      const { wrapper, session } = await mountDialogue()
      try {
        const input = wrapper.findComponent(DialogueInputBar)
        input.vm.$emit('update:input', '第一问')
        input.vm.$emit('send')
        await flushPromises()
        input.vm.$emit('abort')
        input.vm.$emit('update:input', '第二问')
        input.vm.$emit('send')
        await flushPromises()
        const second = currentCall()
        confirmCancellation()
        await flushPromises()
        expect(JSON.parse(localStorage.getItem('sm_pending_chat_requests')!)[session.id]).toBe(
          second[0].requestId,
        )
        expect(wrapper.findComponent(MessageList).props('isThinking')).toBe(true)
        expect(second[0].controller?.signal.aborted).toBe(false)
        expect(wrapper.text()).not.toContain('旧取消请求失败')
      } finally {
        wrapper.unmount()
      }
    },
  )

  it('still reports an unconfirmed cancellation for the current request and keeps it recoverable', async () => {
    vi.mocked(cancelChatStream).mockRejectedValueOnce(new Error('取消连接中断'))
    const { wrapper, session } = await mountDialogue()
    try {
      const input = wrapper.findComponent(DialogueInputBar)
      input.vm.$emit('update:input', '下一问')
      input.vm.$emit('send')
      await flushPromises()
      const requestId = currentCall()[0].requestId
      input.vm.$emit('abort')
      await flushPromises()
      expect(wrapper.text()).toContain('停止请求未确认：取消连接中断')
      expect(wrapper.findComponent(MessageList).props('isThinking')).toBe(false)
      expect(JSON.parse(localStorage.getItem('sm_pending_chat_requests')!)[session.id]).toBe(
        requestId,
      )
    } finally {
      wrapper.unmount()
    }
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
})
