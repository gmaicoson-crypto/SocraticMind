import axios from 'axios'
import { getToken, clearAuth } from '../utils/token'

// 创建 axios 实例，所有接口请求都经过这里
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE,
})

// 请求拦截：自动附加 Bearer Token
api.interceptors.request.use(config => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// 响应拦截：401 时清除本地认证并跳转登录页
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
