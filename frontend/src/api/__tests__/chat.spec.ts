import { afterEach, describe, expect, it, vi } from 'vitest'
import api from '../index'
import { chatStream, getSuggestions } from '../chat'

describe('chatStream terminal events', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('treats a structured error as the terminal event before DONE', async () => {
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode('data: {"error":{"code":"AI_STREAM_ERROR"}}\n\n' + 'data: [DONE]\n\n'),
        )
        controller.close()
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body }))
    const onDone = vi.fn()
    const onError = vi.fn()

    chatStream('node', 1, 'session', 'question', [], 'socratic', '标准', vi.fn(), onDone, onError)

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onError).toHaveBeenCalledOnce()
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
      [],
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
    expect(body).toMatchObject({ quote_text: 'answer', quote_source_id: 7 })
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
