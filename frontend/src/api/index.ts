// index 接口模块，封装后端请求方法。

import axios from 'axios'
import { getToken, clearAuth } from '../utils/token'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE,
})

api.interceptors.request.use(config => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

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
