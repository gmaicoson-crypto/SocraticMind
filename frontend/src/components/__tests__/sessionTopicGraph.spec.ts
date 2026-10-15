import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SocraticDialogue from '../SocraticDialogue.vue'
import MessageList from '../dialogue/MessageList.vue'
import DialogueInputBar from '../dialogue/DialogueInputBar.vue'
import { createDefaultSession } from '../../composables/useChatSessions'
import { useAgentStore } from '../../stores/agent'
import { useLearningStore } from '../../stores/learning'
import { getNodes, getTopics } from '../../api/topic'
import { attachmentCapabilities } from '../../test/fixtures/attachments'
import { getAttachmentCapabilities } from '../../api/attachments'

vi.mock('../../api/chat', () => ({
  chatStream: vi.fn(),
  cancelChatStream: vi.fn().mockResolvedValue(undefined),
  deleteChatSession: vi.fn(),
  deleteMessages: vi.fn(),
  getAllMessages: vi.fn().mockResolvedValue([]),
  getSuggestions: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../api/progress', () => ({
  getStreak: vi.fn().mockResolvedValue({ streak: 0, total_days: 0, recent: [] }),
  recordToday: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../api/models', () => ({
  getLLMModels: vi.fn().mockResolvedValue([]),
  createCustomModel: vi.fn(),
  updateCustomModel: vi.fn(),
  deleteCustomModel: vi.fn(),
}))
vi.mock('../../api/attachments', () => ({
  getAttachmentCapabilities: vi.fn(),
}))

vi.mock('../../api/topic', () => ({
  getNodes: vi.fn(),
  getTopics: vi.fn().mockResolvedValue([]),
  getRecommendations: vi.fn().mockResolvedValue([]),
  updateTopicTitle: vi.fn(),
}))

const nodeData = {
  id: 11,
  node_key: 'old-node',
  label: '旧主题节点',
  sub: '旧节点说明',
  state: 'available' as const,
  x: 0,
  y: 0,
  parent_keys: '',
  estimated_minutes: 10,
  mastery_source: null,
  mastery_confidence: null,
  assessment_result: null,
}

describe('learning session graph state', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.mocked(getAttachmentCapabilities).mockResolvedValue(attachmentCapabilities)
    vi.mocked(getNodes).mockResolvedValue([nodeData])
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    })
    setActivePinia(createPinia())
  })

  function startOnOldTopic() {
    const session = createDefaultSession('socratic')
    session.topicId = 1
    session.topicTitle = '旧主题'
    session.name = '旧主题'
    localStorage.setItem('sm_socratic_sessions', JSON.stringify([session]))
    localStorage.setItem('sm_socratic_cur', session.id)

    const learning = useLearningStore()
    learning.topics = [{ id: '1', title: '旧主题', emoji: '', nodes: 1, mastered: 0 }]
    learning.activeTopicId = '1'
    learning.nodes = [
      {
        id: nodeData.node_key,
        label: nodeData.label,
        sub: nodeData.sub,
        x: 0,
        y: 0,
        state: 'available',
        dbId: nodeData.id,
      },
    ]
    learning.activeNode = learning.nodes[0]
    return learning
  }

  it('hides the previous graph and node card until an existing session is reopened', async () => {
    const learning = startOnOldTopic()
    const dialogue = mount(SocraticDialogue)
    expect(dialogue.find('.mastery-dock').exists()).toBe(true)

    await dialogue.get('.hdr-btn[title="新建对话"]').trigger('click')
    expect(learning.activeTopicId).toBe('')
    expect(learning.nodes).toEqual([])
    expect(learning.activeNode).toBeNull()
    expect(dialogue.find('.mastery-dock').exists()).toBe(false)

    await dialogue.get('.hdr-btn[title="对话历史"]').trigger('click')
    await dialogue.findAll('.history-item')[1].trigger('click')
    await flushPromises()
    expect(learning.activeTopicId).toBe('1')
    expect(learning.nodes.map((node) => node.id)).toEqual(['old-node'])
    dialogue.unmount()
  })

  it('clears the previous graph when onboarding a new topic', async () => {
    const learning = startOnOldTopic()
    const dialogue = mount(SocraticDialogue)

    useAgentStore().openOnboarding('新主题')
    await flushPromises()

    expect(learning.activeTopicId).toBe('')
    expect(learning.nodes).toEqual([])
    expect(learning.activeNode).toBeNull()
    expect(dialogue.find('.mastery-dock').exists()).toBe(false)
    dialogue.unmount()
  })

  it('keeps the node card in the overlay and preserves chat rows when it collapses', async () => {
    startOnOldTopic()
    const dialogue = mount(SocraticDialogue)
    await flushPromises()
    const list = dialogue.findComponent(MessageList)
    const scroll = list.get('.dlg-messages').element
    const messages = [...list.props('messages')]
    const card = list.get('.mastery-dock')
    expect(list.get('.message-overlay').element.contains(card.element)).toBe(true)
    expect(scroll.contains(card.element)).toBe(false)

    await card.get('button[aria-label="收起当前知识节点卡片"]').trigger('click')
    expect(list.get('.dlg-messages').element).toBe(scroll)
    expect(list.props('messages')).toEqual(messages)
    await card.get('button[aria-label="展开当前知识节点卡片"]').trigger('click')
    expect(card.get('.mastery-panel').attributes('aria-hidden')).toBe('false')
    expect(list.get('.dlg-messages').element).toBe(scroll)

    dialogue.findComponent(DialogueInputBar).vm.$emit('update:chatMode', 'normal')
    await flushPromises()
    expect(list.find('.mastery-dock').exists()).toBe(false)
    dialogue.unmount()
  })

  it('ignores nodes returned after the session leaves their topic', async () => {
    const learning = useLearningStore()
    let resolveNodes!: (nodes: (typeof nodeData)[]) => void
    vi.mocked(getNodes).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveNodes = resolve
        }),
    )

    const loading = learning.setActiveTopic('1')
    learning.clearGraph()
    resolveNodes([nodeData])
    await loading

    expect(learning.activeTopicId).toBe('')
    expect(learning.nodes).toEqual([])
  })

  it('does not select an old topic when the topic list loads for a new session', async () => {
    const learning = useLearningStore()
    vi.mocked(getTopics).mockResolvedValueOnce([
      { id: 1, title: '旧主题', emoji: '', total_nodes: 1, mastered_nodes: 0 },
    ])
    const dialogue = mount(SocraticDialogue)

    await learning.fetchTopics()

    expect(learning.topics).toHaveLength(1)
    expect(learning.activeTopicId).toBe('')
    expect(learning.nodes).toEqual([])
    expect(dialogue.find('.mastery-dock').exists()).toBe(false)
    dialogue.unmount()
  })
})
