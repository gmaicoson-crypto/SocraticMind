import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { getNodes, getTopics, type NodeData, type TopicData } from '../../../api/topic'
import { useLearningStore } from '../../../stores/learning'
import TopBar from '../../TopBar.vue'

vi.mock('../../../api/progress', () => ({
  getProfileStats: vi.fn().mockResolvedValue({ chat_count: 0 }),
  getStreak: vi.fn(),
  recordToday: vi.fn(),
}))
vi.mock('../../../api/topic', () => ({
  getNodes: vi.fn(),
  getTopics: vi.fn(),
  getRecommendations: vi.fn().mockResolvedValue([]),
}))

const topicData: TopicData[] = [
  { id: 1, title: '数据结构', emoji: 'D', total_nodes: 4, mastered_nodes: 1 },
  { id: 2, title: '数据库', emoji: 'B', total_nodes: 6, mastered_nodes: 3 },
  { id: 3, title: '空主题', emoji: '', total_nodes: 0, mastered_nodes: 0 },
]
const wrappers: ReturnType<typeof shallowMount>[] = []
let pinia: ReturnType<typeof createPinia>

async function mountProgress() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  })
  await router.push('/')
  const wrapper = shallowMount(TopBar, {
    global: { plugins: [pinia, router], stubs: { TopBarProgress: false, ProgressBar: false } },
  })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}

function expectProgress(
  wrapper: Awaited<ReturnType<typeof mountProgress>>,
  mastered: number,
  total: number,
  percentage: number,
) {
  expect(wrapper.get('.progress-count').text()).toBe(`${mastered} / ${total} 节点`)
  expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe(String(percentage))
  expect(wrapper.get('[role="progressbar"]').attributes('aria-label')).toBe('所有主题学习进度')
}

describe('overall topic progress in the top bar', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.mocked(getTopics).mockReset().mockResolvedValue(topicData)
    vi.mocked(getNodes).mockReset().mockResolvedValue([])
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    })
    pinia = createPinia()
    setActivePinia(pinia)
    const store = useLearningStore()
    store.topics = [
      { id: '1', title: '数据结构', emoji: 'D', nodes: 4, mastered: 1 },
      { id: '2', title: '数据库', emoji: 'B', nodes: 6, mastered: 3 },
      { id: '3', title: '空主题', emoji: '', nodes: 0, mastered: 0 },
    ]
    store.activeTopicId = '1'
    store.nodes = Array.from({ length: 4 }, (_, index) => ({
      id: String(index),
      label: '节点',
      sub: '',
      state: index === 0 ? 'mastered' : 'available',
      x: 0,
      y: 0,
    }))
  })

  afterEach(() => {
    for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  })

  it('counts all topics while retaining the selected graph statistics without extra requests', async () => {
    const store = useLearningStore()
    const wrapper = await mountProgress()
    expectProgress(wrapper, 4, 10, 40)
    expect(store.masteredCount).toBe(1)
    expect(store.totalCount).toBe(4)
    expect(getTopics).not.toHaveBeenCalled()
    expect(getNodes).not.toHaveBeenCalled()
  })

  it('keeps the overall progress while switching graphs or starting an unbound conversation', async () => {
    const store = useLearningStore()
    const wrapper = await mountProgress()
    let finishNodes!: (nodes: NodeData[]) => void
    vi.mocked(getNodes).mockReturnValueOnce(
      new Promise((resolve) => {
        finishNodes = resolve
      }),
    )
    const switching = store.setActiveTopic('2')
    await nextTick()
    expect(store.nodes).toEqual([])
    expectProgress(wrapper, 4, 10, 40)
    finishNodes([])
    await switching
    store.clearGraph()
    await nextTick()
    expectProgress(wrapper, 4, 10, 40)
    expect(store.activeTopicId).toBe('')
    expect(getNodes).toHaveBeenCalledExactlyOnceWith(2)
  })

  it('refreshes the displayed total when server mastery statistics change', async () => {
    const store = useLearningStore()
    const wrapper = await mountProgress()
    vi.mocked(getTopics).mockResolvedValueOnce([
      { ...topicData[0], mastered_nodes: 2 },
      ...topicData.slice(1),
    ])
    await store.fetchTopicsOnly()
    await nextTick()
    expectProgress(wrapper, 5, 10, 50)
    expect(store.masteredCount).toBe(1)
    expect(getNodes).not.toHaveBeenCalled()
  })

  it('updates the total as topics are added and removed', async () => {
    const store = useLearningStore()
    const wrapper = await mountProgress()
    const added = { id: 4, title: '网络', emoji: 'N', total_nodes: 5, mastered_nodes: 2 }
    vi.mocked(getTopics).mockResolvedValueOnce([...topicData, added])
    await store.fetchTopicsOnly()
    await nextTick()
    expectProgress(wrapper, 6, 15, 40)

    vi.mocked(getTopics).mockResolvedValueOnce([...topicData.slice(1), added])
    await store.fetchTopicsOnly()
    await nextTick()
    expectProgress(wrapper, 5, 11, 45)

    vi.mocked(getTopics).mockResolvedValueOnce([])
    await store.fetchTopicsOnly()
    await nextTick()
    expectProgress(wrapper, 0, 0, 0)
    expect(getNodes).not.toHaveBeenCalled()
  })

  it('shows zero when no topics exist instead of falling back to stale graph nodes', async () => {
    const store = useLearningStore()
    store.topics = []
    const wrapper = await mountProgress()
    expectProgress(wrapper, 0, 0, 0)
    expect(store.totalCount).toBe(4)
  })
})
