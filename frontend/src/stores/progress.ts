import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getStreak, recordToday, type StreakData } from '../api/progress'

const streakKey = 'sm_streak'

function loadStreakFromStorage(): StreakData {
  try {
    const raw = localStorage.getItem(streakKey)
    if (raw) return JSON.parse(raw) as StreakData
  } catch {}
  return { streak: 0, total_days: 0, recent: [] }
}

export const useProgressStore = defineStore('progress', () => {
  const streakData = ref<StreakData>(loadStreakFromStorage())

  async function fetchStreak() {
    try {
      const data = await getStreak()
      streakData.value = data
      localStorage.setItem(streakKey, JSON.stringify(data))
    } catch (err) {
      console.error('获取连续学习失败', err)
    }
  }

  async function recordLearning() {
    try {
      await recordToday()
    } catch (err) {
      console.error('记录学习失败', err)
    }
    await fetchStreak()
  }

  return { streakData, fetchStreak, recordLearning }
})
