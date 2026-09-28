import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { getLLMModels } from '../api/models'
import type { LLMModelOption } from '../api/models'
import { getSelectedModelId, saveSelectedModelId } from '../utils/modelSelection'

export const useModelsStore = defineStore('models', () => {
  const models = shallowRef<LLMModelOption[]>([])
  const selectedModelId = ref<string | null>(getSelectedModelId())
  const loading = ref(false)
  const error = ref<string | null>(null)
  const selectedModel = computed(
    () => models.value.find((model) => model.id === selectedModelId.value) ?? null,
  )
  let fetchPromise: Promise<void> | null = null

  function fetchModels(): Promise<void> {
    if (fetchPromise) return fetchPromise
    fetchPromise = (async () => {
      loading.value = true
      error.value = null
      try {
        const available = await getLLMModels()
        models.value = available
        if (!available.some((model) => model.id === selectedModelId.value)) {
          setSelectedModel(available[0]?.id ?? null)
        }
      } catch (cause) {
        error.value = cause instanceof Error ? cause.message : '模型列表加载失败'
      } finally {
        loading.value = false
      }
    })().finally(() => {
      fetchPromise = null
    })
    return fetchPromise
  }

  function setSelectedModel(modelId: string | null) {
    selectedModelId.value = modelId
    saveSelectedModelId(modelId)
  }

  return {
    models,
    selectedModelId,
    selectedModel,
    loading,
    error,
    fetchModels,
    setSelectedModel,
  }
})
