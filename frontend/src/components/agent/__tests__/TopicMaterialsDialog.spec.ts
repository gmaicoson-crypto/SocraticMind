import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TopicMaterialsDialog from '../TopicMaterialsDialog.vue'
import {
  getTopicMaterials,
  listKnowledgeDocuments,
  setTopicMaterials,
} from '../../../api/knowledge'

vi.mock('../../../api/knowledge', () => ({
  getTopicMaterials: vi.fn(),
  listKnowledgeDocuments: vi.fn(),
  setTopicMaterials: vi.fn(),
  requestMaterialIndex: vi.fn(),
}))

const document = {
  id: 'doc',
  name: '教材.pdf',
  mime_type: 'application/pdf',
  size: 1,
  kind: 'document' as const,
  status: 'ready' as const,
  revision: 2,
  warnings: [],
}
const wrappers: ReturnType<typeof mount>[] = []
function dialog() {
  const wrapper = mount(TopicMaterialsDialog, {
    props: { topicId: 1 },
    global: { stubs: { teleport: true } },
  })
  wrappers.push(wrapper)
  return wrapper
}

describe('topic material management', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(listKnowledgeDocuments).mockResolvedValue([document])
    vi.mocked(getTopicMaterials).mockResolvedValue([{ document, revision: 2, available: true }])
    vi.mocked(setTopicMaterials).mockResolvedValue([])
  })
  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  })

  it('loads bound revisions and saves an explicit unbind', async () => {
    const wrapper = dialog()
    await flushPromises()
    expect((wrapper.get('input').element as HTMLInputElement).checked).toBe(true)
    await wrapper.get('input').setValue(false)
    await wrapper.get('.primary').trigger('click')
    await flushPromises()
    expect(setTopicMaterials).toHaveBeenCalledWith(1, [], expect.any(AbortSignal))
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('does not clear materials when initial loading failed', async () => {
    vi.mocked(getTopicMaterials).mockRejectedValue(new Error('offline'))
    const wrapper = dialog()
    await flushPromises()
    await wrapper.get('.primary').trigger('click')
    expect(setTopicMaterials).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('请等待资料加载完成')
  })

  it('blocks duplicate saves and closing while saving, then allows retry after failure', async () => {
    let reject!: (error: Error) => void
    vi.mocked(setTopicMaterials).mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail
      }),
    )
    const wrapper = dialog()
    await flushPromises()
    await wrapper.get('.primary').trigger('click')
    await wrapper.get('.primary').trigger('click')
    expect(setTopicMaterials).toHaveBeenCalledTimes(1)
    expect(wrapper.get('.ui-confirm-dialog__actions button').attributes('disabled')).toBeDefined()
    reject(new Error('offline'))
    await flushPromises()
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    await wrapper.get('.primary').trigger('click')
    await flushPromises()
    expect(setTopicMaterials).toHaveBeenCalledTimes(2)
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('aborts a pending save on unmount and ignores completion', async () => {
    let resolve!: (value: []) => void
    vi.mocked(setTopicMaterials).mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    const wrapper = dialog()
    await flushPromises()
    await wrapper.get('.primary').trigger('click')
    const signal = vi.mocked(setTopicMaterials).mock.calls[0]![2]!
    wrapper.unmount()
    resolve([])
    await flushPromises()
    expect(signal.aborted).toBe(true)
    expect(wrapper.emitted('close')).toBeUndefined()
  })
})
