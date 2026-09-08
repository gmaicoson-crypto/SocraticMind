import { ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import {
  createMemory,
  deleteMemory,
  getMemories,
  updateMemory,
} from '../api/memories'
import type { MemoryFilters } from '../api/memories'
import { parseApiError } from '../api'
import type { ApiProblem } from '../api'
import type { Memory, MemoryInput, MemoryUpdate } from '../types/learningAgent'

export const useMemoriesStore = defineStore('memories', () => {
  const memories = shallowRef<Memory[]>([])
  const loading = ref(false)
  const mutating = ref(false)
  const error = shallowRef<ApiProblem | null>(null)
  let activeMutation: Promise<unknown> | null = null

  async function fetchMemories(filters: MemoryFilters = {}) {
    loading.value = true
    error.value = null
    try {
      memories.value = await getMemories(filters)
      return memories.value
    } catch (cause) {
      error.value = parseApiError(cause)
      return []
    } finally {
      loading.value = false
    }
  }

  function mutate<T>(request: () => Promise<T>, apply: (result: T) => void): Promise<T | null> {
    if (activeMutation) return activeMutation as Promise<T | null>
    mutating.value = true
    error.value = null
    const operation = (async () => {
      try {
        const result = await request()
        apply(result)
        return result
      } catch (cause) {
        error.value = parseApiError(cause)
        return null
      } finally {
        mutating.value = false
        activeMutation = null
      }
    })()
    activeMutation = operation
    return operation
  }

  function addMemory(input: MemoryInput) {
    return mutate(
      () => createMemory(input),
      created => { memories.value = [created, ...memories.value] },
    )
  }

  function editMemory(memoryId: number, input: MemoryUpdate) {
    return mutate(
      () => updateMemory(memoryId, input),
      updated => {
        memories.value = memories.value.map(item => item.id === memoryId ? updated : item)
      },
    )
  }

  function removeMemory(memoryId: number) {
    return mutate(
      () => deleteMemory(memoryId),
      () => { memories.value = memories.value.filter(item => item.id !== memoryId) },
    )
  }

  function clearMemories() {
    memories.value = []
    error.value = null
  }

  return {
    memories, loading, mutating, error,
    fetchMemories, addMemory, editMemory, removeMemory, clearMemories,
  }
})
