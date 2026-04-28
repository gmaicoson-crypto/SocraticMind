import api from './index'

export interface LoginParams {
  email: string
  password: string
}

export interface RegisterParams {
  username: string
  email: string
  password: string
}

export interface UserInfo {
  id: number
  username: string
  email: string
  avatar_grad: string
  bio: string
  daily_goal: number
  ai_style: string
}

// 登录
export async function login(params: LoginParams) {
  const form = new FormData()
  form.append('username', params.email)
  form.append('password', params.password)
  const res = await api.post('/api/auth/login', form)
  return res.data as { access_token: string; user: UserInfo }
}

// 注册
export async function register(params: RegisterParams) {
  const res = await api.post('/api/auth/register', params)
  return res.data as { access_token: string; user: UserInfo }
}

// 获取当前用户
export async function getMe() {
  const res = await api.get('/api/auth/me')
  return res.data as UserInfo
}

// 更新资料
export async function updateMe(data: Partial<UserInfo>) {
  const res = await api.put('/api/auth/me', data)
  return res.data as UserInfo
}