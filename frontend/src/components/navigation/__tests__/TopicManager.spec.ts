import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { deleteTopic, updateTopicTitle, type TopicData } from '../../../api/topic'
import { useLearningStore } from '../../../stores/learning'
import ConfirmDialog from '../../ui/ConfirmDialog.vue'
import TopicManager from '../TopicManager.vue'

vi.mock('../../../api/topic', () => ({
  deleteTopic: vi.fn(),
  updateTopicTitle: vi.fn(),
  getTopics: vi.fn().mockResolvedValue([]),
  getNodes: vi.fn().mockResolvedValue([]),
  getRecommendations: vi.fn().mockResolvedValue([]),
}))

const wrappers: ReturnType<typeof mount>[] = []

function mountManager() {
  const wrapper = mount(TopicManager, {
    props: { show: true },
    global: { stubs: { teleport: true } },
  })
  wrappers.push(wrapper)
  return wrapper
}

describe('topic management', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.mocked(deleteTopic).mockReset().mockResolvedValue(undefined)
    vi.mocked(updateTopicTitle)
      .mockReset()
      .mockImplementation(async (id, title) => ({
        id,
        title,
        emoji: '',
        total_nodes: 0,
        mastered_nodes: 0,
      }))
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    })
    setActivePinia(createPinia())
    const store = useLearningStore()
    store.topics = [
      { id: '1', title: 'Redis', emoji: 'R', nodes: 3, mastered: 1 },
      { id: '2', title: 'MySQL', emoji: 'M', nodes: 2, mastered: 0 },
    ]
    store.activeTopicId = '1'
    vi.spyOn(store, 'fetchTopics').mockImplementation(async () => {
      store.topics = store.topics.filter((topic) => topic.id !== '1')
    })
    vi.spyOn(store, 'setActiveTopic').mockImplementation(async (id) => {
      store.activeTopicId = id
    })
    vi.spyOn(store, 'clearGraph')
  })

  afterEach(() => {
    for (const wrapper of wrappers.splice(0)) wrapper.unmount()
    vi.restoreAllMocks()
  })

  it('uses the conversation confirmation dialog and cancels without deleting', async () => {
    const store = useLearningStore()
    const wrapper = mountManager()
    await wrapper.findAll('[aria-label="删除主题"]')[0].trigger('click')
    expect(
      wrapper
        .findAllComponents(ConfirmDialog)
        .some((dialog) => dialog.props('title') === '删除主题？' && dialog.props('modelValue')),
    ).toBe(true)
    expect(wrapper.get('[role="alertdialog"] h2').text()).toBe('删除主题？')
    expect(wrapper.get('[role="alertdialog"]').text()).toContain('Redis')
    expect(wrapper.find('.confirm-bar').exists()).toBe(false)
    expect(deleteTopic).not.toHaveBeenCalled()
    await wrapper.get('[role="alertdialog"]').findAll('button')[0].trigger('click')
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
    expect(store.topics).toHaveLength(2)
    expect(deleteTopic).not.toHaveBeenCalled()

    await wrapper.findAll('[aria-label="删除主题"]')[0].trigger('click')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
    expect(wrapper.find('.manager-panel').exists()).toBe(true)
  })

  it('blocks duplicate submissions and dismissals while waiting for deletion', async () => {
    const store = useLearningStore()
    let resolveDelete!: () => void
    vi.mocked(deleteTopic).mockImplementationOnce(
      () => new Promise<void>((resolve) => (resolveDelete = resolve)),
    )
    const wrapper = mountManager()
    await wrapper.findAll('[aria-label="删除主题"]')[0].trigger('click')
    const confirm = wrapper.get('[role="alertdialog"] .primary')
    await confirm.trigger('click')
    await confirm.trigger('click')
    expect(deleteTopic).toHaveBeenCalledExactlyOnceWith(1)
    expect(wrapper.get('[role="alertdialog"]').text()).toContain('删除中…')
    expect(
      wrapper.get('[role="alertdialog"]').findAll('button')[0].attributes('disabled'),
    ).toBeDefined()
    await wrapper.get('.close-btn').trigger('click')
    await wrapper.get('.manager-overlay').trigger('click')
    await wrapper.findAll('.topic-left')[1].trigger('click')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(store.setActiveTopic).not.toHaveBeenCalled()
    expect(store.fetchTopics).not.toHaveBeenCalled()
    expect(store.topics).toHaveLength(2)
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(true)

    resolveDelete()
    await flushPromises()
    expect(store.fetchTopics).toHaveBeenCalledOnce()
    expect(store.setActiveTopic).toHaveBeenCalledWith('2')
    expect(store.topics.map((topic) => topic.id)).toEqual(['2'])
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
  })

  it('keeps the topic and the dialog available for retry after a failed request', async () => {
    const store = useLearningStore()
    const wrapper = mountManager()
    await wrapper.findAll('[aria-label="删除主题"]')[0].trigger('click')
    vi.mocked(deleteTopic).mockRejectedValueOnce(new Error('网络中断'))
    await wrapper.get('[role="alertdialog"] .primary').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alertdialog"] [role="alert"]').text()).toContain('网络中断')
    expect(store.topics).toHaveLength(2)
    expect(store.fetchTopics).not.toHaveBeenCalled()
    await wrapper.get('[role="alertdialog"] .primary').trigger('click')
    await flushPromises()
    expect(deleteTopic).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
    expect(store.topics.map((topic) => topic.id)).toEqual(['2'])
  })

  it('clears the graph when the final active topic is deleted', async () => {
    const store = useLearningStore()
    store.topics = [store.topics[0]]
    store.nodes = [{ id: 'redis', label: 'Redis', sub: '', state: 'available', x: 0, y: 0 }]
    const wrapper = mountManager()
    await wrapper.get('[aria-label="删除主题"]').trigger('click')
    await wrapper.get('[role="alertdialog"] .primary').trigger('click')
    await flushPromises()
    expect(store.clearGraph).toHaveBeenCalledOnce()
    expect(store.setActiveTopic).not.toHaveBeenCalled()
    expect(store.nodes).toEqual([])
    expect(store.activeTopicId).toBe('')
  })

  it('preserves the active topic when deleting another topic', async () => {
    const store = useLearningStore()
    store.activeTopicId = '2'
    const wrapper = mountManager()
    await wrapper.findAll('[aria-label="删除主题"]')[0].trigger('click')
    await wrapper.get('[role="alertdialog"] .primary').trigger('click')
    await flushPromises()
    expect(store.activeTopicId).toBe('2')
    expect(store.setActiveTopic).not.toHaveBeenCalled()
    expect(store.clearGraph).not.toHaveBeenCalled()
  })

  it('discards a pending confirmation when the manager is closed externally', async () => {
    const wrapper = mountManager()
    await wrapper.findAll('[aria-label="删除主题"]')[0].trigger('click')
    await wrapper.setProps({ show: false })
    await wrapper.setProps({ show: true })
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
    expect(deleteTopic).not.toHaveBeenCalled()
  })

  it('opens a rename dialog for each topic without selecting it and discards cancelled edits', async () => {
    const store = useLearningStore()
    const wrapper = mountManager()
    const edit = wrapper.findAll('[aria-label="编辑主题名称"]')[1]
    await edit.trigger('click')
    const dialog = wrapper.get('[role="alertdialog"]')
    expect(dialog.get('h2').text()).toBe('编辑主题名称')
    expect((dialog.get('input').element as HTMLInputElement).value).toBe('MySQL')
    expect(dialog.get('input').attributes('maxlength')).toBe('200')
    expect(store.setActiveTopic).not.toHaveBeenCalled()
    expect(wrapper.emitted('close')).toBeUndefined()
    await dialog.get('input').setValue('尚未保存')
    await dialog.findAll('button')[0].trigger('click')
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
    expect(store.topics[1].title).toBe('MySQL')
    expect(updateTopicTitle).not.toHaveBeenCalled()

    await edit.trigger('click')
    expect((wrapper.get('.ui-name-field input').element as HTMLInputElement).value).toBe('MySQL')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
    expect(wrapper.find('.manager-panel').exists()).toBe(true)
  })

  it('saves trimmed names and updates only the renamed topic with the server title', async () => {
    const store = useLearningStore()
    store.nodes = [{ id: 'redis', label: 'Redis', sub: '', state: 'available', x: 0, y: 0 }]
    const nodes = store.nodes
    const topics = store.topics
    vi.mocked(updateTopicTitle).mockResolvedValueOnce({
      id: 2,
      title: 'MySQL 数据库',
      emoji: 'ignored',
      total_nodes: 0,
      mastered_nodes: 0,
    })
    const wrapper = mountManager()
    await wrapper.findAll('[aria-label="编辑主题名称"]')[1].trigger('click')
    await wrapper.get('.ui-name-field input').setValue('  MySQL 数据库  ')
    await wrapper.get('[role="alertdialog"] .primary').trigger('click')
    await flushPromises()
    expect(updateTopicTitle).toHaveBeenCalledExactlyOnceWith(2, 'MySQL 数据库')
    expect(store.topics).not.toBe(topics)
    expect(store.topics[0]).toBe(topics[0])
    expect(store.topics[1]).toEqual({ ...topics[1], title: 'MySQL 数据库' })
    expect(wrapper.findAll('.topic-name')[1].text()).toBe('MySQL 数据库')
    expect(store.activeTopicId).toBe('1')
    expect(store.nodes).toBe(nodes)
    expect(store.fetchTopics).not.toHaveBeenCalled()
    expect(store.setActiveTopic).not.toHaveBeenCalled()
    expect(store.clearGraph).not.toHaveBeenCalled()
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
    expect(wrapper.find('.manager-panel').exists()).toBe(true)
  })

  it('validates names and ignores Enter while an input method is composing', async () => {
    const wrapper = mountManager()
    await wrapper.findAll('[aria-label="编辑主题名称"]')[0].trigger('click')
    const input = wrapper.get('.ui-name-field input')
    await input.setValue('   ')
    await wrapper.get('[role="alertdialog"] .primary').trigger('click')
    expect(wrapper.get('[role="alert"]').text()).toBe('请输入主题名称')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(updateTopicTitle).not.toHaveBeenCalled()
    await input.setValue('字'.repeat(201))
    await wrapper.get('[role="alertdialog"] .primary').trigger('click')
    expect(wrapper.get('[role="alert"]').text()).toContain('200')
    expect(updateTopicTitle).not.toHaveBeenCalled()
    await input.setValue('缓存基础')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    await input.trigger('keydown', { key: 'Enter', isComposing: true })
    expect(updateTopicTitle).not.toHaveBeenCalled()
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(updateTopicTitle).toHaveBeenCalledExactlyOnceWith(1, '缓存基础')
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
  })

  it('blocks duplicate saves and conflicting manager actions until the rename succeeds', async () => {
    const store = useLearningStore()
    let resolveRename!: (value: TopicData) => void
    vi.mocked(updateTopicTitle).mockImplementationOnce(
      () => new Promise<TopicData>((resolve) => (resolveRename = resolve)),
    )
    const wrapper = mountManager()
    await wrapper.findAll('[aria-label="编辑主题名称"]')[0].trigger('click')
    await wrapper.get('.ui-name-field input').setValue('Redis 进阶')
    const confirm = wrapper.get('[role="alertdialog"] .primary')
    await confirm.trigger('click')
    await confirm.trigger('click')
    await wrapper.get('.ui-name-field input').trigger('keydown', { key: 'Enter' })
    expect(updateTopicTitle).toHaveBeenCalledExactlyOnceWith(1, 'Redis 进阶')
    expect(wrapper.get('[role="alertdialog"]').text()).toContain('保存中…')
    expect(wrapper.get('.ui-name-field input').attributes('disabled')).toBeDefined()
    expect(
      wrapper.get('[role="alertdialog"]').findAll('button')[0].attributes('disabled'),
    ).toBeDefined()
    await wrapper.get('.close-btn').trigger('click')
    await wrapper.get('.manager-overlay').trigger('click')
    await wrapper.findAll('[aria-label="编辑主题名称"]')[1].trigger('click')
    await wrapper.findAll('[aria-label="删除主题"]')[0].trigger('click')
    await wrapper.findAll('.topic-left')[1].trigger('click')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(store.setActiveTopic).not.toHaveBeenCalled()
    expect(deleteTopic).not.toHaveBeenCalled()
    expect(store.topics[0].title).toBe('Redis')
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(true)

    resolveRename({ id: 1, title: 'Redis 进阶', emoji: 'R', total_nodes: 3, mastered_nodes: 1 })
    await flushPromises()
    expect(store.topics[0].title).toBe('Redis 进阶')
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
  })

  it('retains the draft on failure and allows retry without prematurely changing the topic', async () => {
    const store = useLearningStore()
    vi.mocked(updateTopicTitle).mockRejectedValueOnce(new Error('网络中断'))
    const wrapper = mountManager()
    await wrapper.findAll('[aria-label="编辑主题名称"]')[0].trigger('click')
    await wrapper.get('.ui-name-field input').setValue('Redis 基础')
    await wrapper.get('[role="alertdialog"] .primary').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('网络中断')
    expect((wrapper.get('.ui-name-field input').element as HTMLInputElement).value).toBe(
      'Redis 基础',
    )
    expect(store.topics[0].title).toBe('Redis')
    expect(wrapper.get('.ui-name-field input').attributes('disabled')).toBeUndefined()
    await wrapper.get('[role="alertdialog"] .primary').trigger('click')
    await flushPromises()
    expect(updateTopicTitle).toHaveBeenCalledTimes(2)
    expect(store.topics[0].title).toBe('Redis 基础')
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
  })

  it('closes an unchanged name without making an unnecessary request', async () => {
    const wrapper = mountManager()
    await wrapper.findAll('[aria-label="编辑主题名称"]')[0].trigger('click')
    await wrapper.get('.ui-name-field input').setValue('  Redis  ')
    await wrapper.get('[role="alertdialog"] .primary').trigger('click')
    expect(updateTopicTitle).not.toHaveBeenCalled()
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
  })

  it('discards a pending rename when the manager is closed externally', async () => {
    const wrapper = mountManager()
    await wrapper.findAll('[aria-label="编辑主题名称"]')[0].trigger('click')
    await wrapper.get('.ui-name-field input').setValue('尚未保存')
    await wrapper.setProps({ show: false })
    await wrapper.setProps({ show: true })
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
    await wrapper.findAll('[aria-label="编辑主题名称"]')[0].trigger('click')
    expect((wrapper.get('.ui-name-field input').element as HTMLInputElement).value).toBe('Redis')
    expect(updateTopicTitle).not.toHaveBeenCalled()
  })

  it('cleans up a save completed after the manager is hidden', async () => {
    const store = useLearningStore()
    let resolveRename!: (value: TopicData) => void
    vi.mocked(updateTopicTitle).mockImplementationOnce(
      () => new Promise<TopicData>((resolve) => (resolveRename = resolve)),
    )
    const wrapper = mountManager()
    await wrapper.findAll('[aria-label="编辑主题名称"]')[0].trigger('click')
    await wrapper.get('.ui-name-field input').setValue('Redis 进阶')
    await wrapper.get('[role="alertdialog"] .primary').trigger('click')
    await wrapper.setProps({ show: false })
    resolveRename({ id: 1, title: 'Redis 进阶', emoji: 'R', total_nodes: 3, mastered_nodes: 1 })
    await flushPromises()
    await wrapper.setProps({ show: true })
    expect(store.topics[0].title).toBe('Redis 进阶')
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
  })
})
