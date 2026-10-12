import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import InlineMarkdown from '../InlineMarkdown.vue'
import MessageSources from '../MessageSources.vue'
import { getAttachmentChunk } from '../../../api/attachments'
import { webSnapshot } from '../../../test/fixtures/webSearch'
import type { FileSource } from '../../../types/webSearch'
vi.mock('../../../api/attachments', () => ({
  getAttachmentChunk: vi.fn(),
  getAttachmentBlob: vi.fn(),
  downloadAttachment: vi.fn(),
}))
const source: FileSource = {
  id: 's6',
  kind: 'document',
  title: '讲义.pdf',
  attachment_id: 'private-id',
  revision: 2,
  chunk_id: 'chunk-3',
  locator: { page: 3 },
  excerpt: '摘要',
  retrieved_at: '2026-10-07T00:00:00Z',
}
afterEach(() => {
  document.body.innerHTML = ''
  vi.clearAllMocks()
})
describe('private file citations', () => {
  it('opens an authenticated excerpt with its fixed revision and never emits an arbitrary link', async () => {
    vi.mocked(getAttachmentChunk).mockResolvedValue({
      attachment_id: 'private-id',
      revision: 2,
      chunk_id: 'chunk-3',
      text: '完整的受保护摘录',
      locator: { page: 3 },
      block_type: 'paragraph',
      title_path: [],
    })
    const web = webSnapshot({ sources: [source], cited_source_ids: ['s6'] })
    const w = mount(InlineMarkdown, {
      props: { text: '见资料 [[source:s6]]', assistant: true, web },
    })
    expect(w.find('a').exists()).toBe(false)
    await w.get('button.file-citation').trigger('click')
    await flushPromises()
    expect(getAttachmentChunk).toHaveBeenCalledWith('private-id', 'chunk-3', 2)
    expect(document.body.textContent).toContain('完整的受保护摘录')
    expect(document.body.textContent).toContain('第 3 页')
    w.unmount()
  })
  it('marks revoked source references unavailable in both inline text and source list', () => {
    const web = webSnapshot({ sources: [{ ...source, deleted: true }], cited_source_ids: ['s6'] })
    const inline = mount(InlineMarkdown, { props: { text: '[[source:s6]]', assistant: true, web } })
    const list = mount(MessageSources, { props: { web } })
    expect(inline.text()).toContain('资料已删除')
    expect(inline.find('button.file-citation').exists()).toBe(false)
    expect(list.get('button.file-source').attributes('disabled')).toBeDefined()
    inline.unmount()
    list.unmount()
  })
})
