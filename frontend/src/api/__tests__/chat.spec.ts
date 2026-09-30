import { afterEach, describe, expect, it, vi } from 'vitest'
import api from '../index'
import { chatStream, cancelChatStream, getSuggestions } from '../chat'

describe('chatStream terminal events', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('treats a structured error as the terminal event before DONE', async () => {
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"request_state":{"status":"failed"}}\n\n' +
              'data: {"error":{"code":"AI_STREAM_ERROR","message":"服务不可用"}}\n\n' +
              'data: [DONE]\n\n',
          ),
        )
        controller.close()
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body }))
    const onDone = vi.fn()
    const onError = vi.fn()

    chatStream(
      'node',
      1,
      'session',
      'question',
      'request-one',
      'socratic',
      '标准',
      vi.fn(),
      onDone,
      onError,
    )

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onError).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'AI_STREAM_ERROR', message: '服务不可用' }),
    )
    expect(onDone).not.toHaveBeenCalled()
  })

  it('sends the quote text and source id with a follow-up', () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({ start: (controller) => controller.close() }),
    })
    vi.stubGlobal('fetch', fetchMock)

    chatStream(
      'node',
      1,
      'session',
      '> answer\n\nwhy?',
      'request-one',
      'socratic',
      '标准',
      vi.fn(),
      vi.fn(),
      vi.fn(),
      undefined,
      undefined,
      'qa',
      { text: 'answer', sourceId: 7 },
    )

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toMatchObject({
      quote_text: 'answer',
      quote_source_id: 7,
      request_id: 'request-one',
    })
    expect(body).not.toHaveProperty('history')
  })

  it('does not treat an unexpected EOF as a successful reply', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"text":"partial"}\n\n'))
            controller.close()
          },
        }),
      }),
    )
    const onChunk = vi.fn()
    const onDone = vi.fn()
    const onError = vi.fn()
    await chatStream(
      'node',
      1,
      'session',
      'question',
      'request',
      'socratic',
      '标准',
      onChunk,
      onDone,
      onError,
    )
    expect(onChunk).toHaveBeenCalledWith('partial')
    expect(onDone).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CHAT_STREAM_DISCONNECTED' }),
    )
  })

  it('reads a final DONE without a blank line and accepts an explicit complete state', async () => {
    for (const terminal of ['[DONE]', '{"request_state":{"status":"complete"}}']) {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  `data: {"msg_ids":{"user":3,"ai":4}}\r\n\r\ndata: ${terminal}`,
                ),
              )
              controller.close()
            },
          }),
        }),
      )
      const onDone = vi.fn()
      const onError = vi.fn()
      const onIds = vi.fn()
      await chatStream(
        'node',
        1,
        'session',
        'question',
        'request',
        'socratic',
        '标准',
        vi.fn(),
        onDone,
        onError,
        undefined,
        onIds,
      )
      expect(onIds).toHaveBeenCalledWith(3, 4)
      expect(onDone).toHaveBeenCalledOnce()
      expect(onError).not.toHaveBeenCalled()
    }
  })

  it('shows backend capacity and concurrency errors instead of generic HTTP failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          detail: { code: 'CHAT_REQUEST_RUNNING', message: '当前会话正在生成回复' },
        }),
      }),
    )
    const onError = vi.fn()
    await chatStream(
      'node',
      1,
      'session',
      'question',
      'request',
      'socratic',
      '标准',
      vi.fn(),
      vi.fn(),
      onError,
    )
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CHAT_REQUEST_RUNNING', message: '当前会话正在生成回复' }),
    )
  })

  it('reports context preparation separately from answer completion', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                'data: {"type":"context_compacting"}\n\n' +
                  'data: {"type":"context_ready"}\n\n' +
                  'data: {"text":"answer"}\n\n' +
                  'data: [DONE]\n\n',
              ),
            )
            controller.close()
          },
        }),
      }),
    )
    const onContext = vi.fn()
    const onDone = vi.fn()
    const onError = vi.fn()
    await chatStream(
      'node',
      1,
      'session',
      'question',
      'request',
      'socratic',
      '标准',
      vi.fn(),
      onDone,
      onError,
      undefined,
      undefined,
      'qa',
      undefined,
      undefined,
      null,
      onContext,
    )
    expect(onContext.mock.calls).toEqual([['compacting'], ['ready']])
    expect(onDone).toHaveBeenCalledOnce()
    expect(onError).not.toHaveBeenCalled()
    expect(onContext.mock.invocationCallOrder[1]).toBeLessThan(onDone.mock.invocationCallOrder[0])
  })

  it('retains persisted message ids and non-retryable capacity errors from HTTP responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 413,
        json: async () => ({
          code: 'CHAT_CONTEXT_TOO_LARGE',
          message: '请缩小引用范围',
          retryable: false,
          msg_ids: { user: 8, ai: 9 },
        }),
      }),
    )
    const onIds = vi.fn()
    const onError = vi.fn()
    await chatStream(
      'node',
      1,
      'session',
      'question',
      'request',
      'socratic',
      '标准',
      vi.fn(),
      vi.fn(),
      onError,
      undefined,
      onIds,
    )
    expect(onIds).toHaveBeenCalledWith(8, 9)
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CHAT_CONTEXT_TOO_LARGE', retryable: false }),
    )
    expect(onIds.mock.invocationCallOrder[0]).toBeLessThan(onError.mock.invocationCallOrder[0])
  })

  it('sends a new generation target and not historical messages', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
          controller.close()
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await chatStream(
      'node',
      1,
      'session',
      'question',
      'new-request',
      'socratic',
      '标准',
      vi.fn(),
      vi.fn(),
      vi.fn(),
      undefined,
      undefined,
      'qa',
      undefined,
      9,
    )
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      request_id: 'new-request',
      regenerate_message_id: 9,
    })
  })

  it('cancels the matching server request', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} })
    await cancelChatStream('session', 'request')
    expect(post).toHaveBeenCalledWith('/api/chat/cancel', {
      session_id: 'session',
      request_id: 'request',
    })
  })

  it('requests new suggestions with the currently visible texts excluded', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({
      data: { suggestions: ['新建议'], source: 'ai' },
    })

    const result = await getSuggestions('socratic', ['我想学 Python', '教我机器学习'])

    expect(result).toEqual({ suggestions: ['新建议'], source: 'ai' })
    expect(get).toHaveBeenCalledWith('/api/chat/suggestions', {
      params: expect.any(URLSearchParams),
    })
    const params = get.mock.calls[0][1]?.params as URLSearchParams
    expect(params.get('mode')).toBe('socratic')
    expect(params.getAll('exclude')).toEqual(['我想学 Python', '教我机器学习'])
  })
})
