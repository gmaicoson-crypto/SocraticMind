import { afterEach, describe, expect, it, vi } from 'vitest'
import { chatStream } from '../chat'

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
})
