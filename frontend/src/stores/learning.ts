// learning 状态模块，集中管理学习相关共享状态。

import { defineStore } from 'pinia'
import { ref, shallowRef, computed } from 'vue'
import type { KNode, KEdge, Topic, Message } from '../types'
import { getTopics, getNodes, masterNode as apiMasterNode } from '../api/topic'
import { getRecommendations } from '../api/topic'
import { recordToday, getStreak } from '../api/progress'
import type { StreakData } from '../api/progress'
import { loadUser } from '../utils/token'

function getInitialTheme(): boolean {
  const stored = localStorage.getItem('sm_theme')
  if (stored !== null) return stored === 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyTheme(dark: boolean) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
}

export const useLearningStore = defineStore('learning', () => {

  const isDark = ref(getInitialTheme())
  applyTheme(isDark.value)

  const nodes = shallowRef<KNode[]>([])
  const edges = shallowRef<KEdge[]>([])
  const topics = shallowRef<Topic[]>([])
  const activeTopicId = ref('')
  const activeNode = shallowRef<KNode | null>(null)
  const messages = shallowRef<Message[]>([])
  const lastMasteredId = ref<string | null>(null)
  const recommendations = shallowRef<{ title: string; emoji: string; reason: string }[]>([])

  const pendingTopicOverviewId = ref<number | null>(null)
  function requestTopicOverview(topicId: number | null) {
    pendingTopicOverviewId.value = topicId
  }

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

  const streakData = ref<StreakData>({
    streak: 0,
    total_days: 0,
    recent: [],
  })

  const masteredCount = computed(() => nodes.value.filter(n => n.state === 'mastered').length)
  const totalCount = computed(() => nodes.value.length)
  const availableCount = computed(() => nodes.value.filter(n => n.state === 'available').length)

  function setUserInfo(info: typeof userInfo.value) {
    userInfo.value = info
  }

  function loadUserFromStorage() {
    const data = loadUser()
    if (data) userInfo.value = data as typeof userInfo.value
  }

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

  async function setActiveTopic(id: string) {
    if (activeTopicId.value !== id) {
      activeNode.value = null
    }
    activeTopicId.value = id
    const numId = Number(id)
    if (!isNaN(numId)) await fetchNodes(numId)
  }

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
      lastMasteredId.value = nodeId
    } catch (err) {
      console.error('标记掌握失败', err)
      throw err
    }
  }

  function addMessage(msg: Message) {
    messages.value.push(msg)
  }

  function toggleTheme() {
    isDark.value = !isDark.value
    localStorage.setItem('sm_theme', isDark.value ? 'dark' : 'light')
    applyTheme(isDark.value)
  }

  function clearGraph() {
    nodes.value = []
    edges.value = []
    activeTopicId.value = ''
    activeNode.value = null
  }

  return {
    isDark, nodes, edges, topics,
    activeTopicId, activeNode, messages, userInfo,
    lastMasteredId,
    recommendations,
    streakData,
    pendingTopicOverviewId,
    masteredCount, totalCount, availableCount,
    toggleTheme,
    setUserInfo, loadUserFromStorage,
    fetchTopics, fetchNodes, setActiveTopic,
    setActiveNode, masterNode, addMessage,
    clearGraph,
    fetchTopicsOnly,
    fetchRecommendations,
    fetchStreak, recordLearning,
    requestTopicOverview,
  }
})
