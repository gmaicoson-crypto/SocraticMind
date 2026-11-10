// progress 接口模块，封装后端请求方法。

import api from './index'

export interface StreakData {
  streak: number
  total_days: number
  recent: { date: string; learned: boolean }[]
}

export async function recordToday() {
  const res = await api.post<{ next_record_at_ms?: number }>('/api/progress/record')
  return res.data.next_record_at_ms
}

export async function getStreak() {
  const res = await api.get('/api/progress/streak')
  return res.data as StreakData
}

export interface ProfileStats {
  chat_count: number
  mastered_count: number
  streak: number
  total_days: number
  heatmap: { date: string; count: number }[]
  timeline: { type: string; title: string; sub: string; time: string; occurred_at?: string }[]
  badges: { icon: string; name: string; unlocked: boolean }[]
  weekly?: {
    chat_count: number
    mastered_count: number
    peak_hour: string
    avg_daily: number
    days_learned: number
  }
}

export async function getProfileStats() {
  const res = await api.get('/api/progress/stats')
  return res.data as ProfileStats
}
