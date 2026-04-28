import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE,
})

// 自动带上 Token
api.interceptors.request.use(config => {
  const token = localStorage.getItem('sm_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// 401 自动跳转登录
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('sm_token')
      localStorage.removeItem('sm_logged_in')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api