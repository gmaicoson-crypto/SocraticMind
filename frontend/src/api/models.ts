import api from './index'

export interface LLMModelOption {
  id: string
  name: string
  model: string
}

export async function getLLMModels() {
  const response = await api.get('/api/llm/models')
  return response.data.models as LLMModelOption[]
}
