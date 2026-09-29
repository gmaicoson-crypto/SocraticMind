import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import {
  createCustomModel,
  deleteCustomModel,
  getLLMModels,
  updateCustomModel,
} from '../api/models'
import type { CustomModelOption, LLMModelOption } from '../api/models'
import { getSelectedModelId, saveSelectedModelId } from '../utils/modelSelection'

export const useModelsStore = defineStore('models', () => {
  const models = shallowRef<LLMModelOption[]>([])
  const selectedModelId = ref<string | null>(getSelectedModelId())
  const loading = ref(false)
  const error = ref<string | null>(null)
  const selectedModel = computed(
    () => models.value.find((model) => model.id === selectedModelId.value) ?? null,
  )
  const environmentModels = computed(() =>
    models.value.filter((model) => model.source === 'environment'),
  )
  const customModels = computed(() =>
    models.value.filter((model): model is CustomModelOption => model.source === 'custom'),
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

  async function addCustomModel(input: Parameters<typeof createCustomModel>[0]) {
    const created = await createCustomModel(input)
    models.value = [...models.value, created]
    setSelectedModel(created.id)
    return created
  }

  async function editCustomModel(modelId: string, input: Parameters<typeof updateCustomModel>[1]) {
    const updated = await updateCustomModel(modelId, input)
    models.value = models.value.map((model) => (model.id === modelId ? updated : model))
    return updated
  }

  async function removeCustomModel(modelId: string) {
    await deleteCustomModel(modelId)
    models.value = models.value.filter((model) => model.id !== modelId)
    if (selectedModelId.value === modelId) {
      setSelectedModel(models.value[0]?.id ?? null)
    }
  }

  return {
    models,
    environmentModels,
    customModels,
    selectedModelId,
    selectedModel,
    loading,
    error,
    fetchModels,
    setSelectedModel,
    addCustomModel,
    editCustomModel,
    removeCustomModel,
  }
})
