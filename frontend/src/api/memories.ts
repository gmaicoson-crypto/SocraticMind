import api from './index'
import type {
  Memory,
  MemoryInput,
  MemoryKind,
  MemoryUpdate,
} from '../types/learningAgent'

export interface MemoryFilters {
  topic_id?: number
  kind?: MemoryKind
}

export async function getMemories(filters: MemoryFilters = {}) {
  const response = await api.get('/api/agent/memories', { params: filters })
  return response.data as Memory[]
}

export async function createMemory(input: MemoryInput) {
  const response = await api.post('/api/agent/memories', input)
  return response.data as Memory
}

export async function updateMemory(memoryId: number, input: MemoryUpdate) {
  const response = await api.patch(`/api/agent/memories/${memoryId}`, input)
  return response.data as Memory
}

export async function deleteMemory(memoryId: number) {
  await api.delete(`/api/agent/memories/${memoryId}`)
}
