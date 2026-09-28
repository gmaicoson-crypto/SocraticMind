const STORAGE_KEY = 'sm_llm_model'

export function getSelectedModelId() {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function saveSelectedModelId(modelId: string | null) {
  try {
    if (modelId) localStorage.setItem(STORAGE_KEY, modelId)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 无法使用 localStorage 时仍保留本次运行的内存状态。
  }
}
