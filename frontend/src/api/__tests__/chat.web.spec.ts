import { afterEach, describe, expect, it, vi } from 'vitest'
import { chatStream, type ChatStreamRequest } from '../chat'
import { webSnapshot } from '../../test/fixtures/webSearch'

const request: ChatStreamRequest = {
  nodeKey: 'normal',
  topicId: 0,
  sessionId: 'session',
  userInput: '最新版本',
  requestId: 'request',
  mode: 'normal',
  aiStyle: '标准',
}

function mockEvents(events: unknown[]) {
  const text =
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n'
  const bytes = new TextEncoder().encode(text)
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    body: new ReadableStream({
      start(controller) {
        // Deliberately split both SSE fields and multibyte Chinese characters.
        for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7))
        controller.close()
      },
    }),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('chat web contract', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('keeps web warnings non-terminal and delivers final sources before completion', async () => {
    const web = webSnapshot()
    const warning = { code: 'WEB_PARTIAL_RESULTS', message: '部分资料不可用', retryable: true }
    mockEvents([
      { msg_ids: { user: 1, ai: 2 } },
      {
        type: 'web_status',
        request_id: 'request',
        ai_message_id: 2,
        status: 'searching',
        web: { ...web, status: 'searching' },
      },
      { type: 'web_warning', request_id: 'request', ai_message_id: 2, warning, web },
      { text: '回答 [[source:s1]]' },
      { type: 'web_sources', request_id: 'request', ai_message_id: 2, web, final: true },
      { request_state: { status: 'complete' } },
    ])
    const order: string[] = []
    const onError = vi.fn()
    await chatStream(request, {
      onChunk: (text) => order.push(text),
      onWebEvent: (event) => order.push(event.type),
      onDone: () => order.push('done'),
      onError,
    })
    expect(order).toEqual([
      'web_status',
      'web_warning',
      '回答 [[source:s1]]',
      'web_sources',
      'done',
    ])
    expect(onError).not.toHaveBeenCalled()
  })

  it('ignores web snapshots from other requests, messages, or before message ids', async () => {
    const event = {
      type: 'web_sources',
      request_id: 'request',
      ai_message_id: 2,
      web: webSnapshot(),
      final: true,
    }
    mockEvents([
      event,
      { msg_ids: { user: 1, ai: 2 } },
      { ...event, request_id: 'other' },
      { ...event, ai_message_id: 3 },
      event,
    ])
    const onWebEvent = vi.fn()
    await chatStream(request, { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn(), onWebEvent })
    expect(onWebEvent).toHaveBeenCalledExactlyOnceWith(event)
  })

  it.each(['qa', 'node_overview', 'topic_overview'] as const)(
    'leaves search decisions to the backend for %s',
    async (kind) => {
      const fetchMock = mockEvents([])
      await chatStream(
        { ...request, kind },
        { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() },
      )
      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.kind).toBe(kind)
      expect(body).not.toHaveProperty('web_mode')
      expect(body).not.toHaveProperty('webMode')
    },
  )

  it('stops consuming web events and text after cancellation during searching', async () => {
    const controller = new AbortController()
    const event = {
      type: 'web_status',
      request_id: 'request',
      ai_message_id: 2,
      status: 'searching',
      web: webSnapshot({ status: 'searching' }),
    }
    mockEvents([
      { msg_ids: { user: 1, ai: 2 } },
      event,
      { text: '迟到内容' },
      { ...event, status: 'ready' },
    ])
    const onChunk = vi.fn(),
      onDone = vi.fn(),
      onError = vi.fn()
    const onWebEvent = vi.fn(() => controller.abort())
    await chatStream({ ...request, controller }, { onChunk, onDone, onError, onWebEvent })
    expect(onWebEvent).toHaveBeenCalledOnce()
    expect(onChunk).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })
})
