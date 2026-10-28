import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import MaterialSelector from '../MaterialSelector.vue'
import OnboardingForm from '../OnboardingForm.vue'
import {
  getTopicMaterials,
  listKnowledgeDocuments,
  requestMaterialIndex,
} from '../../../api/knowledge'
import type { AttachmentSummary } from '../../../types/attachments'

vi.mock('../../../api/knowledge', () => ({
  getTopicMaterials: vi.fn(),
  listKnowledgeDocuments: vi.fn(),
  requestMaterialIndex: vi.fn(),
}))

const document: AttachmentSummary = {
  id: 'doc-1',
  name: '教材.pdf',
  mime_type: 'application/pdf',
  size: 120,
  kind: 'document',
  status: 'ready',
  revision: 2,
  warnings: [],
  retryable: false,
}

async function open(wrapper: ReturnType<typeof mount>) {
  const details = wrapper.get('details')
  ;(details.element as HTMLDetailsElement).open = true
  await details.trigger('toggle')
  await flushPromises()
}

describe('MaterialSelector', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(listKnowledgeDocuments).mockResolvedValue([document])
  })

  it('shows lexical fallback and can retry a failed semantic index', async () => {
    vi.mocked(listKnowledgeDocuments).mockResolvedValue([
      { ...document, index_status: { status: 'failed', completed_chunks: 0, total_chunks: 2 } },
    ])
    vi.mocked(requestMaterialIndex).mockResolvedValue({
      status: 'pending',
      completed_chunks: 0,
      total_chunks: 2,
    })
    const wrapper = mount(MaterialSelector)
    await open(wrapper)
    expect(wrapper.text()).toContain('语义索引失败，暂用关键词检索')
    await wrapper.get('li button').trigger('click')
    await flushPromises()
    expect(requestMaterialIndex).toHaveBeenCalledWith(
      { attachment_id: 'doc-1', revision: 2 },
      expect.any(AbortSignal),
    )
    expect(wrapper.text()).toContain('语义索引排队中')
  })

  it('aborts pending indexing and ignores late status after navigation', async () => {
    vi.mocked(listKnowledgeDocuments).mockResolvedValue([
      { ...document, index_status: { status: 'failed', completed_chunks: 0, total_chunks: 2 } },
    ])
    let resolve!: (value: {
      status: 'pending'
      completed_chunks: number
      total_chunks: number
    }) => void
    vi.mocked(requestMaterialIndex).mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    const wrapper = mount(MaterialSelector)
    await open(wrapper)
    await wrapper.get('li button').trigger('click')
    const signal = vi.mocked(requestMaterialIndex).mock.calls[0]![1]!
    await wrapper.setProps({ topicId: 2 })
    resolve({ status: 'pending', completed_chunks: 0, total_chunks: 2 })
    await flushPromises()
    expect(signal.aborted).toBe(true)
    expect(wrapper.text()).not.toContain('语义索引排队中')
  })

  it('loads lazily and submits selected immutable revisions with the plan', async () => {
    const wrapper = mount(OnboardingForm, { props: { topic: '数学', sessionId: 's' } })
    expect(listKnowledgeDocuments).not.toHaveBeenCalled()
    await open(wrapper)
    await wrapper.get('.material-selector input').setValue(true)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({
      materials: [{ attachment_id: 'doc-1', revision: 2 }],
    })
    await wrapper.setProps({ busy: true })
    expect(wrapper.get('.material-selector input').attributes('disabled')).toBeDefined()
  })

  it('initializes available topic materials without silently accepting obsolete revisions', async () => {
    vi.mocked(getTopicMaterials).mockResolvedValue([
      { document, revision: 2, available: true },
      { document: { ...document, id: 'gone' }, revision: 1, available: false },
    ])
    const wrapper = mount(MaterialSelector, { props: { topicId: 1 } })
    await open(wrapper)
    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toEqual([
      { attachment_id: 'doc-1', revision: 2 },
    ])
    expect(wrapper.text()).toContain('部分主题资料已失效')
  })

  it('shows request failures and supports refresh', async () => {
    vi.mocked(listKnowledgeDocuments).mockRejectedValueOnce(new Error('offline'))
    const wrapper = mount(MaterialSelector)
    await open(wrapper)
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('教材.pdf')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('aborts loading on unmount and ignores a late topic response', async () => {
    let resolve!: (value: AttachmentSummary[]) => void
    vi.mocked(listKnowledgeDocuments).mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    const wrapper = mount(MaterialSelector)
    const details = wrapper.get('details')
    ;(details.element as HTMLDetailsElement).open = true
    await details.trigger('toggle')
    const signal = vi.mocked(listKnowledgeDocuments).mock.calls[0]![1]!
    wrapper.unmount()
    resolve([document])
    await flushPromises()
    expect(signal.aborted).toBe(true)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
