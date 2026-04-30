import api from './index'

export interface StreakData {
  streak: number
  total_days: number
  recent: { date: string; learned: boolean }[]
}

export async function recordToday() {
  await api.post('/api/progress/record')
}

export async function getStreak() {
  const res = await api.get('/api/progress/streak')
  return res.data as StreakData
}