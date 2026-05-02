import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { KNode, KEdge, Topic, Message } from '../types'
import { getTopics, getNodes, masterNode as apiMasterNode } from '../api/topic'
import { getRecommendations } from '../api/topic'
import { recordToday, getStreak } from '../api/progress'
import type { StreakData } from '../api/progress'

export const useLearningStore = defineStore('learning', () => {

  // ── 主题状态 ──
  const isDark = ref(false)
  const nodes = ref<KNode[]>([])
  const edges = ref<KEdge[]>([])
  const topics = ref<Topic[]>([])
  const activeTopicId = ref('')
  const activeNode = ref<KNode | null>(null)
  const messages = ref<Message[]>([])
  const lastMasteredId = ref<string | null>(null)
  const recommendations = ref<{ title: string; emoji: string; reason: string }[]>([])

  // ── 用户信息 ──
  const userInfo = ref<{
    id: number
    username: string
    email: string
    avatar_grad: string
    avatar_url: string | null
    bio: string
    daily_goal: number
    ai_style: string
  } | null>(null)

  /// ── 进度状态 ──
  const streakData = ref<StreakData>({
    streak: 0,
    total_days: 0,
    recent: [],
  })

  // ── 计算属性 ──
  const masteredCount = computed(() => nodes.value.filter(n => n.state === 'mastered').length)
  const totalCount = computed(() => nodes.value.length)
  const availableCount = computed(() => nodes.value.filter(n => n.state === 'available').length)

  // ── 用户信息方法 ──
  function setUserInfo(info: typeof userInfo.value) {
    userInfo.value = info
  }

  function loadUserFromStorage() {
    const raw = localStorage.getItem('sm_user')
    if (raw) {
      try { userInfo.value = JSON.parse(raw) } catch (err) {
        console.warn('解析本地用户信息失败，已忽略', err)
      }
    }
  }

  // ── 主题与节点加载 ──
  async function fetchNodes(topicId: number) {
    try {
      const data = await getNodes(topicId)
      nodes.value = data.map(n => ({
        id: n.node_key,
        label: n.label,
        sub: n.sub,
        x: n.x,
        y: n.y,
        state: n.state,
        dbId: n.id,
      }))
      // 从 parent_keys 解析边
      const newEdges: KEdge[] = []
      data.forEach(n => {
        if (n.parent_keys) {
          n.parent_keys.split(',').forEach(pk => {
            if (pk.trim()) newEdges.push({ source: pk.trim(), target: n.node_key })
          })
        }
      })
      edges.value = newEdges
    } catch (err) {
      console.error('加载节点失败', err)
    }
  }

  async function fetchTopics() {
    try {
      const data = await getTopics()
      topics.value = data.map(t => ({
        id: String(t.id),
        title: t.title,
        emoji: t.emoji,
        nodes: t.total_nodes,
        mastered: t.mastered_nodes,
      }))
      if (data.length > 0) {
        activeTopicId.value = String(data[0].id)
        await fetchNodes(data[0].id)
      }
      fetchRecommendations()
    } catch (err) {
      console.error('加载主题失败', err)
    }
  }

  async function fetchTopicsOnly() {
  try {
    const data = await getTopics()
    topics.value = data.map(t => ({
      id: String(t.id),
      title: t.title,
      emoji: t.emoji,
      nodes: t.total_nodes,
      mastered: t.mastered_nodes,
    }))
      // 不重置 activeTopicId
    } catch (err) {
      console.error('加载主题失败', err)
    }
  }

  async function fetchStreak() {
  try {
    streakData.value = await getStreak()
  } catch (err) {
    console.error('获取连续学习失败', err)
  }
}

  async function recordLearning() {
    try {
      await recordToday()
      await fetchStreak()
    } catch (err) {
      console.error('记录学习失败', err)
    }
  }

  async function fetchRecommendations() {
    try {
      const data = await getRecommendations()
      recommendations.value = data
    } catch (err) {
      console.error('加载推荐失败', err)
    }
  }

  // ── 主题切换 ──
  async function setActiveTopic(id: string) {
    activeTopicId.value = id
    const numId = Number(id)
    if (!isNaN(numId)) await fetchNodes(numId)
  }

  // ── 节点操作 ──
  function setActiveNode(node: KNode | null) {
    activeNode.value = node
  }

  async function masterNode(nodeId: string) {
    const node = nodes.value.find(n => n.id === nodeId)
    if (!node || !node.dbId) return
    try {
      await apiMasterNode(node.dbId)
      nodes.value = nodes.value.map(n =>
        n.id === nodeId ? { ...n, state: 'mastered' as const } : n
      )
      const masteredIds = new Set(nodes.value.filter(n => n.state === 'mastered').map(n => n.id))
      nodes.value = nodes.value.map(n => {
        if (n.state === 'locked') {
          const parents = edges.value.filter(e => e.target === n.id).map(e => e.source)
          if (parents.some(p => masteredIds.has(p))) {
            return { ...n, state: 'available' as const }
          }
        }
        return n
      })
      lastMasteredId.value = nodeId  // 触发 confetti
    } catch (err) {
      console.error('标记掌握失败', err)
      throw err  // 抛出让 NotesPanel 捕获
    }
  }

  // ── 消息 ──
  function addMessage(msg: Message) {
    messages.value.push(msg)
  }

  // ── 主题切换 ──
  function toggleTheme() {
    isDark.value = !isDark.value
    document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light')
  }

  function clearGraph() {
    nodes.value = []
    edges.value = []
    activeTopicId.value = ''
    activeNode.value = null
  }

  return {
    // 状态
    isDark, nodes, edges, topics,
    activeTopicId, activeNode, messages, userInfo,
    lastMasteredId,
    recommendations,
    streakData, 
    // 计算
    masteredCount, totalCount, availableCount,
    // 方法
    toggleTheme,
    setUserInfo, loadUserFromStorage,
    fetchTopics, fetchNodes, setActiveTopic,
    setActiveNode, masterNode, addMessage,
    clearGraph,
    fetchTopicsOnly,
    fetchRecommendations,
    fetchStreak, recordLearning,
  }
})