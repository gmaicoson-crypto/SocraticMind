// auth 接口模块，封装后端请求方法。

import api from './index'

export interface LoginParams {
  email: string
  password: string
}

export interface RegisterParams {
  username: string
  email: string
  password: string
  code: string
}

export type CodePurpose = 'register' | 'reset'

export interface UserInfo {
  id: number
  username: string
  email: string
  avatar_grad: string
  avatar_url: string | null
  bio: string
  daily_goal: number
  ai_style: string
}

export async function login(params: LoginParams) {
  const form = new FormData()
  form.append('username', params.email)
  form.append('password', params.password)
  const res = await api.post('/api/auth/login', form)
  return res.data as { access_token: string; user: UserInfo }
}

export async function register(params: RegisterParams) {
  const res = await api.post('/api/auth/register', params)
  return res.data as { access_token: string; user: UserInfo }
}

export async function getMe() {
  const res = await api.get('/api/auth/me')
  return res.data as UserInfo
}

export async function updateMe(data: Partial<UserInfo>) {
  const res = await api.put('/api/auth/me', data)
  return res.data as UserInfo
}

export async function uploadAvatar(file: File) {
  const form = new FormData()
  form.append('file', file)
  const res = await api.post('/api/auth/avatar', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data as UserInfo
}

export async function resetAvatar() {
  const res = await api.delete('/api/auth/avatar')
  return res.data as UserInfo
}

export async function changePassword(oldPassword: string, newPassword: string) {
  await api.put('/api/auth/password', {
    old_password: oldPassword,
    new_password: newPassword,
  })
}

export async function sendVerificationCode(email: string, purpose: CodePurpose) {
  const res = await api.post('/api/auth/send-code', { email, purpose })
  return res.data as { message: string }
}

export async function resetPassword(email: string, code: string, newPassword: string) {
  const res = await api.post('/api/auth/reset-password', {
    email,
    code,
    new_password: newPassword,
  })
  return res.data as { message: string }
}

export async function deleteAccount(password: string, confirm: string) {
  const res = await api.delete('/api/auth/me', {
    data: { password, confirm },
  })
  return res.data as { message: string }
}
