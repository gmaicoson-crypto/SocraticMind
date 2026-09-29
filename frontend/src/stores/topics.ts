import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import type { KEdge, KNode, Topic } from '../types'
import { getNodes, getRecommendations, getTopics } from '../api/topic'
import { useModelsStore } from './models'

export const useTopicsStore = defineStore('topics', () => {
  const nodes = shallowRef<KNode[]>([])
  const edges = shallowRef<KEdge[]>([])
  const topics = shallowRef<Topic[]>([])
  const activeTopicId = ref('')
  const activeNode = shallowRef<KNode | null>(null)
  const nodeDialogueRequest = ref(0)
  const lastMasteredId = ref<string | null>(null)
  const recommendations = shallowRef<{ title: string; emoji: string; reason: string }[]>([])
  const masteredCount = computed(
    () => nodes.value.filter((node) => node.state === 'mastered').length,
  )
  const totalCount = computed(() => nodes.value.length)
  const availableCount = computed(
    () => nodes.value.filter((node) => node.state === 'available').length,
  )

  async function fetchNodes(topicId: number) {
    try {
      const data = await getNodes(topicId)
      nodes.value = data.map((node) => ({
        id: node.node_key,
        label: node.label,
        sub: node.sub,
        x: node.x,
        y: node.y,
        state: node.state,
        dbId: node.id,
        estimatedMinutes: node.estimated_minutes,
        masterySource: node.mastery_source,
        masteryConfidence: node.mastery_confidence,
        assessmentResult: node.assessment_result,
      }))
      const nextEdges: KEdge[] = []
      data.forEach((node) =>
        node.parent_keys?.split(',').forEach((parentKey) => {
          if (parentKey.trim()) nextEdges.push({ source: parentKey.trim(), target: node.node_key })
        }),
      )
      edges.value = nextEdges
    } catch (err) {
      console.error('加载节点失败', err)
    }
  }

  async function fetchTopicsOnly() {
    try {
      const data = await getTopics()
      topics.value = data.map((topic) => ({
        id: String(topic.id),
        title: topic.title,
        emoji: topic.emoji,
        nodes: topic.total_nodes,
        mastered: topic.mastered_nodes,
      }))
    } catch (err) {
      console.error('加载主题失败', err)
    }
  }

  async function fetchRecommendations() {
    try {
      const modelStore = useModelsStore()
      if (modelStore.models.length === 0) await modelStore.fetchModels()
      const selectedId = modelStore.selectedModelId
      const model = modelStore.models.some((available) => available.id === selectedId)
        ? selectedId
        : null
      recommendations.value = await getRecommendations(model)
    } catch (err) {
      console.error('加载推荐失败', err)
    }
  }

  async function fetchTopics() {
    try {
      const data = await getTopics()
      topics.value = data.map((topic) => ({
        id: String(topic.id),
        title: topic.title,
        emoji: topic.emoji,
        nodes: topic.total_nodes,
        mastered: topic.mastered_nodes,
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

  async function setActiveTopic(id: string) {
    if (activeTopicId.value !== id) activeNode.value = null
    activeTopicId.value = id
    const numericId = Number(id)
    if (!Number.isNaN(numericId)) await fetchNodes(numericId)
  }

  function setActiveNode(node: KNode | null) {
    activeNode.value = node
  }
  function requestNodeDialogue(node: KNode) {
    activeNode.value = node
    nodeDialogueRequest.value += 1
  }
  function clearGraph() {
    nodes.value = []
    edges.value = []
    activeTopicId.value = ''
    activeNode.value = null
  }

  function notifyMastery(nodeId: string) {
    lastMasteredId.value = nodeId
  }

  return {
    nodes,
    edges,
    topics,
    activeTopicId,
    activeNode,
    nodeDialogueRequest,
    lastMasteredId,
    recommendations,
    masteredCount,
    totalCount,
    availableCount,
    fetchNodes,
    fetchTopics,
    fetchTopicsOnly,
    fetchRecommendations,
    setActiveTopic,
    setActiveNode,
    requestNodeDialogue,
    notifyMastery,
    clearGraph,
  }
})
