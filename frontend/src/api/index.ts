import axios from 'axios'
import { getToken, clearAuth } from '../utils/token'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE,
})

// 自动带上 Token
api.interceptors.request.use(config => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// 401 自动跳转登录
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      clearAuth()
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api