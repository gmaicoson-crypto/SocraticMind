// index 接口模块，封装后端请求方法。

import axios from 'axios'
import { getToken, clearAuth } from '../utils/token'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE,
})

export interface ApiProblem {
  code: string
  message: string
  retryable: boolean
  status?: number
}

interface ErrorLike {
  message?: string
  response?: {
    status?: number
    data?: {
      code?: string
      message?: string
      detail?: string
      retryable?: boolean
    }
  }
}

export function parseApiError(error: unknown): ApiProblem {
  const candidate = error as ErrorLike
  const data = candidate.response?.data
  return {
    code: data?.code ?? 'REQUEST_FAILED',
    message: data?.message ?? data?.detail ?? candidate.message ?? '请求失败，请稍后重试',
    retryable: data?.retryable ?? false,
    status: candidate.response?.status,
  }
}

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      clearAuth()
      window.location.href = '/login'
    }
    return Promise.reject(err)
  },
)

export default api
