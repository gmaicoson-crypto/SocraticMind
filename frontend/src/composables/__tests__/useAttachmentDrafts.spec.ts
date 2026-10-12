import { defineComponent, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useAttachmentDrafts } from '../useAttachmentDrafts'
import * as api from '../../api/attachments'
import { attachment, attachmentCapabilities } from '../../test/fixtures/attachments'
import type { AttachmentScope } from '../../types/attachments'
vi.mock('../../api/attachments', () => ({
  getAttachmentCapabilities: vi.fn(),
  uploadAttachment: vi.fn(),
  getAttachments: vi.fn(),
  deleteAttachment: vi.fn(),
  retryAttachment: vi.fn(),
  acceptAttachmentCoverage: vi.fn(),
}))
let harness: ReturnType<typeof mount> | undefined
async function setup() {
  const scope = ref<AttachmentScope>({ session_id: 'a', mode: 'normal' })
  let drafts!: ReturnType<typeof useAttachmentDrafts>
  harness = mount(
    defineComponent({
      setup() {
        drafts = useAttachmentDrafts(scope)
        return () => null
      },
    }),
  )
  await flushPromises()
  return { scope, drafts }
}
describe('attachment draft isolation and lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    vi.mocked(api.getAttachmentCapabilities).mockResolvedValue(attachmentCapabilities)
    vi.mocked(api.deleteAttachment).mockResolvedValue(undefined)
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL = vi.fn(() => `blob:${crypto.randomUUID()}`)
        static revokeObjectURL = vi.fn()
      },
    )
  })
  afterEach(() => {
    harness?.unmount()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
  it('limits uploads to two and sends a late response only to its captured conversation', async () => {
    const resolvers: ((value: ReturnType<typeof attachment>) => void)[] = []
    vi.mocked(api.uploadAttachment).mockImplementation(
      () => new Promise((resolve) => resolvers.push(resolve)),
    )
    const { scope, drafts } = await setup()
    drafts.add([new File(['a'], 'a.pdf'), new File(['b'], 'b.pdf'), new File(['c'], 'c.pdf')])
    expect(api.uploadAttachment).toHaveBeenCalledTimes(2)
    scope.value = { session_id: 'b', mode: 'normal' }
    await flushPromises()
    expect(drafts.drafts.value).toHaveLength(0)
    resolvers[0]!(attachment({ id: 'a' }))
    await flushPromises()
    expect(api.uploadAttachment).toHaveBeenCalledTimes(3)
    expect(drafts.drafts.value).toHaveLength(0)
    scope.value = { session_id: 'a', mode: 'normal' }
    await flushPromises()
    expect(drafts.drafts.value[0]!.attachment.id).toBe('a')
    expect(api.uploadAttachment).toHaveBeenLastCalledWith(
      expect.any(File),
      expect.any(String),
      { session_id: 'a', mode: 'normal' },
      expect.any(AbortSignal),
      expect.any(Function),
    )
  })
  it('keeps upload identity on retry and removes files from the server', async () => {
    vi.mocked(api.uploadAttachment)
      .mockRejectedValueOnce(new Error('离线'))
      .mockResolvedValueOnce(attachment())
    const { drafts } = await setup()
    drafts.add([new File(['a'], 'a.pdf')])
    await flushPromises()
    const id = drafts.drafts.value[0]!.clientId
    expect(drafts.ready.value).toBe(false)
    await drafts.retry(id)
    await flushPromises()
    expect(vi.mocked(api.uploadAttachment).mock.calls[0]![1]).toBe(
      vi.mocked(api.uploadAttachment).mock.calls[1]![1],
    )
    expect(drafts.ready.value).toBe(true)
    await drafts.remove(id)
    expect(api.deleteAttachment).toHaveBeenCalledWith('attachment-1')
    expect(drafts.drafts.value).toHaveLength(0)
  })
  it('batches polling and requires explicit mixed PDF coverage confirmation', async () => {
    vi.mocked(api.uploadAttachment).mockResolvedValue(attachment({ status: 'pending' }))
    vi.mocked(api.getAttachments).mockResolvedValue([
      attachment({
        status: 'needs_confirmation',
        coverage: { recognized_pages: [1], missing_pages: [2] },
      }),
    ])
    vi.mocked(api.acceptAttachmentCoverage).mockResolvedValue(attachment())
    const { drafts } = await setup()
    drafts.add([new File(['a'], 'a.pdf')])
    await flushPromises()
    await vi.advanceTimersByTimeAsync(1500)
    expect(api.getAttachments).toHaveBeenCalledWith(['attachment-1'])
    expect(drafts.ready.value).toBe(false)
    await drafts.acceptCoverage(drafts.drafts.value[0]!.clientId)
    expect(api.acceptAttachmentCoverage).toHaveBeenCalledWith('attachment-1', 1)
    expect(drafts.ready.value).toBe(true)
  })
  it('releases image urls across scope changes and returns only JSON summaries from snapshot', async () => {
    vi.mocked(api.uploadAttachment).mockResolvedValue(attachment({ kind: 'image', name: 'a.png' }))
    const { drafts, scope } = await setup()
    drafts.add([new File(['a'], 'a.png', { type: 'image/png' })])
    await flushPromises()
    const oldUrl = drafts.drafts.value[0]!.previewUrl
    expect(JSON.stringify(drafts.snapshot())).not.toContain('blob:')
    expect(drafts.snapshot()[0]).not.toHaveProperty('file')
    scope.value = { session_id: 'b', mode: 'normal' }
    await flushPromises()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(oldUrl)
    scope.value = { session_id: 'a', mode: 'normal' }
    await flushPromises()
    expect(drafts.drafts.value[0]!.previewUrl).not.toBe(oldUrl)
    drafts.consume(['attachment-1'])
    expect(drafts.drafts.value).toHaveLength(0)
  })
  it.each([
    ['image/jpeg', '截图', '截图.jpg'],
    ['image/png', '截图', '截图.png'],
    ['image/webp', '截图', '截图.webp'],
    ['image/png', '', '粘贴图片.png'],
  ])(
    'uploads extensionless %s screenshots with a usable filename',
    async (type, name, expected) => {
      vi.mocked(api.uploadAttachment).mockResolvedValue(
        attachment({ kind: 'image', name: expected, mime_type: type }),
      )
      const { drafts } = await setup()
      const original = new File(['pixels'], name, { type, lastModified: 12345 })
      drafts.add([original])
      await flushPromises()
      const uploaded = vi.mocked(api.uploadAttachment).mock.calls[0]![0]
      expect(uploaded.name).toBe(expected)
      expect(uploaded.type).toBe(type)
      expect(uploaded.size).toBe(original.size)
      expect(uploaded.lastModified).toBe(original.lastModified)
      const contents = new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(reader.error)
        reader.readAsText(uploaded)
      })
      await vi.runAllTimersAsync()
      expect(await contents).toBe('pixels')
      expect(drafts.drafts.value[0]!.previewUrl).toBeDefined()
      expect(drafts.snapshot()[0]).toMatchObject({ kind: 'image', name: expected })
      expect(drafts.ready.value).toBe(true)
    },
  )
  it('preserves named images and rejects unsupported formats and misleading extensions', async () => {
    vi.mocked(api.uploadAttachment).mockResolvedValue(attachment({ kind: 'image', name: 'a.JPEG' }))
    const { drafts } = await setup()
    const image = new File(['pixels'], 'a.JPEG', { type: 'image/jpeg' })
    drafts.add([
      image,
      new File(['pixels'], 'screenshot', { type: 'image/gif' }),
      new File(['pixels'], 'a.exe', { type: 'image/png' }),
    ])
    await flushPromises()
    expect(api.uploadAttachment).toHaveBeenCalledTimes(1)
    expect(vi.mocked(api.uploadAttachment).mock.calls[0]![0]).toBe(image)
    expect(drafts.error.value).toContain('screenshot：不支持此文件类型')
    expect(drafts.error.value).toContain('a.exe：不支持此文件类型')
  })
  it('applies image size limits to screenshots before uploading or creating thumbnails', async () => {
    vi.mocked(api.getAttachmentCapabilities).mockResolvedValue({
      ...attachmentCapabilities,
      limits: { ...attachmentCapabilities.limits, max_image_bytes: 2 },
    })
    const { drafts } = await setup()
    drafts.add([new File(['pixels'], '截图', { type: 'image/png' })])
    await flushPromises()
    expect(api.uploadAttachment).not.toHaveBeenCalled()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(drafts.drafts.value).toHaveLength(0)
    expect(drafts.error.value).toContain('截图.png：文件超过大小限制')
  })
  it('accepts nine images and rejects a tenth file before uploading it', async () => {
    vi.mocked(api.uploadAttachment).mockResolvedValue(attachment())
    const { drafts } = await setup()
    drafts.add([
      new File(['a'], 'a.exe'),
      ...Array.from({ length: 10 }, (_, i) => new File(['a'], `${i}.png`, { type: 'image/png' })),
    ])
    await flushPromises()
    expect(drafts.drafts.value).toHaveLength(9)
    expect(api.uploadAttachment).toHaveBeenCalledTimes(9)
    expect(drafts.error.value).toContain('不支持此文件类型')
    expect(drafts.error.value).toContain('最多 9')
  })
})
