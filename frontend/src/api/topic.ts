import api from './index'

export interface TopicData {
  id: number
  title: string
  emoji: string
  total_nodes: number
  mastered_nodes: number
}

export interface NodeData {
  id: number
  node_key: string
  label: string
  sub: string
  state: 'mastered' | 'available' | 'locked'
  x: number
  y: number
  parent_keys: string
}

export interface Recommendation {
  title: string
  emoji: string
  reason: string
}

export async function getTopics() {
  const res = await api.get('/api/topics')
  return res.data as TopicData[]
}

export async function createTopic(title: string, emoji: string = '📚') {
  const res = await api.post('/api/topics', { title, emoji })
  return res.data as TopicData
}

export async function getNodes(topicId: number) {
  const res = await api.get(`/api/nodes/topic/${topicId}`)
  return res.data as NodeData[]
}

export async function masterNode(nodeId: number) {
  const res = await api.put(`/api/nodes/${nodeId}/master`)
  return res.data as NodeData
}

export async function generateTopic(title: string, emoji: string = '📚') {
  const res = await api.post('/api/topics/generate', { title, emoji })
  return res.data as TopicData
}

export async function deleteTopic(topicId: number) {
  await api.delete(`/api/topics/${topicId}`)
}

export async function updateTopicTitle(topicId: number, title: string) {
  const res = await api.patch(`/api/topics/${topicId}`, { title })
  return res.data as TopicData
}

export interface SearchedNode {
  id: number
  node_key: string
  label: string
  sub: string
  state: 'mastered' | 'available' | 'locked'
  topic_id: number
  topic_title: string
  topic_emoji: string
}

export async function searchNodes(q: string, limit = 10) {
  const res = await api.get('/api/nodes/search', { params: { q, limit } })
  return res.data as SearchedNode[]
}

export async function getRecommendations() {
  const res = await api.get('/api/topics/recommend')
  return res.data.recommendations as Recommendation[]
}