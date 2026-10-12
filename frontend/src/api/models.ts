import api from './index'

export interface VisionModelOptions {
  image_input?: 'supported' | 'unsupported' | 'unknown'
  max_images?: number
  max_image_bytes?: number
  vision_token_budget?: number | null
}
interface ModelOptionBase extends VisionModelOptions {
  id: string
  name: string
  model: string
}

export interface EnvironmentModelOption extends ModelOptionBase {
  source: 'environment'
}

export interface CustomModelOption extends ModelOptionBase {
  source: 'custom'
  base_url: string
}

export type LLMModelOption = EnvironmentModelOption | CustomModelOption

export async function getLLMModels() {
  const response = await api.get('/api/llm/models')
  return response.data.models as LLMModelOption[]
}

export interface CustomModelInput extends VisionModelOptions {
  name: string
  api_key: string
  base_url: string
  model: string
}

export async function createCustomModel(input: CustomModelInput) {
  const response = await api.post('/api/llm/models', input)
  return response.data as CustomModelOption
}

export async function updateCustomModel(
  modelId: string,
  input: Omit<CustomModelInput, 'api_key'> & { api_key?: string },
) {
  const response = await api.put(`/api/llm/models/${encodeURIComponent(modelId)}`, input)
  return response.data as CustomModelOption
}

export async function deleteCustomModel(modelId: string) {
  await api.delete(`/api/llm/models/${encodeURIComponent(modelId)}`)
}
