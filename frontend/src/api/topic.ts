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