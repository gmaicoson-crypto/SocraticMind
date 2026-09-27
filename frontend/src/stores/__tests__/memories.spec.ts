import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import * as memoriesApi from '../../api/memories'
import type { Memory } from '../../types/learningAgent'
import { useMemoriesStore } from '../memories'

vi.mock('../../api/memories', () => ({
  createMemory: vi.fn(),
  deleteMemory: vi.fn(),
  getMemories: vi.fn(),
  updateMemory: vi.fn(),
}))

const memory: Memory = {
  id: 1,
  topic_id: null,
  kind: 'preference',
  content: 'Use examples',
  source: 'user',
  confidence: null,
  created_at: '2026-09-07T00:00:00Z',
  updated_at: '2026-09-07T00:00:00Z',
}

describe('memories store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('keeps server CRUD responses as the local collection', async () => {
    vi.mocked(memoriesApi.getMemories).mockResolvedValue([memory])
    vi.mocked(memoriesApi.createMemory).mockResolvedValue({ ...memory, id: 2 })
    vi.mocked(memoriesApi.updateMemory).mockResolvedValue({ ...memory, content: 'Updated' })
    vi.mocked(memoriesApi.deleteMemory).mockResolvedValue(undefined)
    const store = useMemoriesStore()

    await store.fetchMemories()
    await store.addMemory({ kind: 'preference', content: 'Use examples', topic_id: null })
    await store.editMemory(1, { content: 'Updated' })
    await store.removeMemory(2)

    expect(store.memories.map((item) => item.id)).toEqual([1])
    expect(store.memories[0].content).toBe('Updated')
  })

  it('blocks a second mutation while one is active', async () => {
    let resolveRequest: (value: Memory) => void = () => undefined
    vi.mocked(memoriesApi.createMemory).mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve
      }),
    )
    const store = useMemoriesStore()
    const payload = { kind: 'goal' as const, content: 'Learn', topic_id: null }

    const first = store.addMemory(payload)
    const second = store.addMemory(payload)
    expect(memoriesApi.createMemory).toHaveBeenCalledTimes(1)
    resolveRequest({ ...memory, kind: 'goal', content: 'Learn' })
    await Promise.all([first, second])
  })

  it('keeps a memory when deletion fails', async () => {
    vi.mocked(memoriesApi.getMemories).mockResolvedValue([memory])
    vi.mocked(memoriesApi.deleteMemory).mockRejectedValue(new Error('network'))
    const store = useMemoriesStore()
    await store.fetchMemories()

    const result = await store.removeMemory(memory.id)

    expect(result).toBeNull()
    expect(store.memories).toEqual([memory])
    expect(store.error).not.toBeNull()
  })
})
