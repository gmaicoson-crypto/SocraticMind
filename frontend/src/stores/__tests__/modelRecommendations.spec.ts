import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { getLLMModels } from '../../api/models'
import { getRecommendations } from '../../api/topic'
import { useModelsStore } from '../models'
import { useTopicsStore } from '../topics'

vi.mock('../../api/models', () => ({ getLLMModels: vi.fn() }))
vi.mock('../../api/topic', () => ({ getRecommendations: vi.fn() }))

describe('recommendation model selection', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
    vi.mocked(getRecommendations).mockResolvedValue([])
  })

  it('waits for an in-flight model load before using a saved selection', async () => {
    localStorage.setItem('sm_llm_model', 'default')
    let finishLoad: (models: { id: string; name: string; model: string }[]) => void = () =>
      undefined
    vi.mocked(getLLMModels).mockReturnValue(
      new Promise((resolve) => {
        finishLoad = resolve
      }),
    )

    const models = useModelsStore()
    const loading = models.fetchModels()
    const recommending = useTopicsStore().fetchRecommendations()

    expect(getLLMModels).toHaveBeenCalledTimes(1)
    expect(getRecommendations).not.toHaveBeenCalled()

    finishLoad([{ id: 'current', name: 'Current', model: 'current-model' }])
    await Promise.all([loading, recommending])

    expect(getRecommendations).toHaveBeenCalledWith('current')
    expect(localStorage.getItem('sm_llm_model')).toBe('current')
  })

  it('omits an unverified saved model if the model list cannot load', async () => {
    localStorage.setItem('sm_llm_model', 'removed')
    vi.mocked(getLLMModels).mockRejectedValue(new Error('Unavailable'))

    await useTopicsStore().fetchRecommendations()

    expect(getRecommendations).toHaveBeenCalledWith(null)
  })

  it('clears a saved model when the server has no configured options', async () => {
    localStorage.setItem('sm_llm_model', 'removed')
    vi.mocked(getLLMModels).mockResolvedValue([])

    await useModelsStore().fetchModels()

    expect(localStorage.getItem('sm_llm_model')).toBeNull()
  })
})
