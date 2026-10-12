import { afterEach, describe, expect, it, vi } from 'vitest'
import api from '../index'
import {
  getAttachments,
  getAttachmentBlob,
  uploadAttachment,
  acceptAttachmentCoverage,
  downloadAttachment,
} from '../attachments'
import { attachment } from '../../test/fixtures/attachments'
vi.mock('../index', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }))
describe('private attachment api', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })
  it('uses multipart and repeats ids for bounded batch reads', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: attachment() })
    const file = new File(['a'], 'a.pdf')
    const signal = new AbortController().signal
    const progress = vi.fn()
    await uploadAttachment(
      file,
      'uuid',
      { session_id: 's', mode: 'socratic', topic_id: 3 },
      signal,
      progress,
    )
    const call = vi.mocked(api.post).mock.calls.at(-1)!
    const form = call[1] as FormData
    expect(form.get('client_upload_id')).toBe('uuid')
    expect(form.get('session_id')).toBe('s')
    expect(form.get('topic_id')).toBe('3')
    expect(form.get('file')).toBe(file)
    expect(call[2]?.signal).toBe(signal)
    vi.mocked(api.get).mockResolvedValue({ data: [attachment()] })
    await getAttachments(['a', 'b'])
    expect(vi.mocked(api.get).mock.calls.at(-1)![1]?.params.toString()).toBe('ids=a&ids=b')
  })
  it('fetches private content as authenticated client blobs and confirms the current revision', async () => {
    const blob = new Blob(['private'])
    vi.mocked(api.get).mockResolvedValue({ data: blob })
    expect(await getAttachmentBlob('id', true)).toBe(blob)
    expect(api.get).toHaveBeenCalledWith('/api/attachments/id/preview', {
      responseType: 'blob',
      signal: undefined,
    })
    vi.mocked(api.post).mockResolvedValue({ data: attachment() })
    await acceptAttachmentCoverage('id', 2)
    expect(api.post).toHaveBeenCalledWith('/api/attachments/id/accept-text-coverage', {
      revision: 2,
    })
  })
  it.each([false, true])(
    'mounts a download link, cleans it up, and delays Blob disposal (click throws: %s)',
    async (throws) => {
      vi.useFakeTimers()
      const createObjectURL = vi.fn(() => 'blob:private-download')
      const revokeObjectURL = vi.fn()
      vi.stubGlobal(
        'URL',
        class extends URL {
          static createObjectURL = createObjectURL
          static revokeObjectURL = revokeObjectURL
        },
      )
      vi.mocked(api.get).mockResolvedValue({ data: new Blob(['private']) })
      let clicked: HTMLAnchorElement | undefined
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        clicked = this
        expect(this.isConnected).toBe(true)
        expect(document.body.contains(this)).toBe(true)
        expect(this.download).toBe('中文讲义.pdf')
        expect(this.href).toBe('blob:private-download')
        if (throws) throw new Error('下载启动失败')
      })
      const download = downloadAttachment({ id: 'id', name: '中文讲义.pdf' })
      if (throws) await expect(download).rejects.toThrow('下载启动失败')
      else await download
      expect(clicked).toBeDefined()
      expect(clicked!.isConnected).toBe(false)
      expect(document.querySelector('a[download]')).toBeNull()
      await vi.advanceTimersByTimeAsync(29_999)
      expect(revokeObjectURL).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:private-download')
    },
  )
})
