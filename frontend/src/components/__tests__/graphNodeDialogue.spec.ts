import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { chatStream } from '../../api/chat'
import { useLearningStore } from '../../stores/learning'
import type { KNode } from '../../types'
import KnowledgeGraph from '../KnowledgeGraph.vue'
import SocraticDialogue from '../SocraticDialogue.vue'

vi.mock('../../api/chat', () => ({
  chatStream: vi.fn(),
  deleteChatSession: vi.fn(),
  deleteMessages: vi.fn(),
  getAllMessages: vi.fn().mockResolvedValue([]),
  getSuggestions: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../api/progress', () => ({
  getStreak: vi.fn().mockResolvedValue({ streak: 0, total_days: 0, recent: [] }),
  recordToday: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../graph/ThreeGraphCanvas.vue', () => ({
  default: {
    name: 'ThreeGraphCanvas',
    emits: ['select', 'activate'],
    template: '<div />',
  },
}))

const node: KNode = {
  id: 'rag-overview',
  label: '理解 RAG',
  sub: '检索增强生成',
  x: 0,
  y: 0,
  state: 'available',
}

describe('knowledge graph node dialogue', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    })
    setActivePinia(createPinia())
  })

  it('starts AI only for explicit requests, including a selected node', async () => {
    const learning = useLearningStore()
    const dialogue = mount(SocraticDialogue)

    learning.setActiveNode(node)
    await flushPromises()
    expect(learning.activeNode?.id).toBe(node.id)
    expect(chatStream).not.toHaveBeenCalled()

    learning.requestNodeDialogue(node)
    await flushPromises()
    expect(chatStream).toHaveBeenCalledTimes(1)
    expect(vi.mocked(chatStream).mock.calls[0]?.[0]).toBe(node.id)

    learning.requestNodeDialogue(node)
    await flushPromises()
    expect(chatStream).toHaveBeenCalledTimes(2)
    dialogue.unmount()
  })

  it('shows a toast without starting AI when a locked graph node is double-clicked', async () => {
    const learning = useLearningStore()
    const lockedNode: KNode = { ...node, id: 'locked-node', state: 'locked' }
    learning.nodes = [lockedNode, node]
    const requestDialogue = vi.spyOn(learning, 'requestNodeDialogue')
    const graph = mount(KnowledgeGraph)
    const canvas = graph.findComponent({ name: 'ThreeGraphCanvas' })

    canvas.vm.$emit('select', lockedNode)
    await flushPromises()
    expect(learning.activeNode?.id).toBe(lockedNode.id)
    expect(chatStream).not.toHaveBeenCalled()

    canvas.vm.$emit('activate', lockedNode)
    await flushPromises()
    expect(graph.find('[role="status"]').text()).toBe('请先掌握前置节点')
    expect(learning.nodeDialogueRequest).toBe(0)
    expect(requestDialogue).not.toHaveBeenCalled()

    canvas.vm.$emit('activate', node)
    await flushPromises()
    expect(learning.nodeDialogueRequest).toBe(1)
    expect(requestDialogue).toHaveBeenCalledOnce()

    graph.unmount()
  })
})
