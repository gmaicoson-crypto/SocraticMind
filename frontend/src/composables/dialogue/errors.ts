export function chatErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const value = error as { message?: string; response?: { data?: { detail?: unknown } } }
    const detail = value.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (detail && typeof detail === 'object' && 'message' in detail) return String(detail.message)
    if (value.message) return value.message
  }
  return '请求失败，请重试。'
}
