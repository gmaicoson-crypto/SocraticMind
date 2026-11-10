import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { getStreak, recordToday, type StreakData } from '../api/progress'
import { getToken } from '../utils/token'
import { useUserStore } from './user'

interface DailySync {
  token: string
  expiresAt?: number
  synced: boolean
  pending?: Promise<void>
}

function emptyStreak(): StreakData {
  return { streak: 0, total_days: 0, recent: [] }
}

export const useProgressStore = defineStore('progress', () => {
  const userStore = useUserStore()
  const streakData = ref(emptyStreak())
  let dailySync: DailySync | undefined

  watch(
    () => userStore.userInfo?.id,
    () => {
      dailySync = undefined
      streakData.value = emptyStreak()
    },
    { flush: 'sync' },
  )

  async function syncProgress(current: DailySync) {
    try {
      if (current.expiresAt === undefined) {
        const nextRecordAt = await recordToday()
        // Older servers omit the next check-in time.
        current.expiresAt = nextRecordAt ?? new Date().setHours(24, 0, 0, 0)
      }
      if (dailySync !== current || getToken() !== current.token) return
      const data = await getStreak()
      if (dailySync === current && getToken() === current.token) {
        streakData.value = data
        current.synced = true
      }
    } catch (err) {
      console.error('同步学习进度失败', err)
    }
  }

  function recordLearning() {
    const token = getToken()
    if (!token || !userStore.userInfo?.id) return Promise.resolve()
    if (dailySync?.token === token && dailySync.pending) return dailySync.pending
    if (dailySync?.token !== token || Date.now() >= (dailySync.expiresAt ?? Infinity)) {
      dailySync = { token, synced: false }
    }
    const current = dailySync
    if (current.synced) return Promise.resolve()
    current.pending = syncProgress(current).finally(() => {
      current.pending = undefined
    })
    return current.pending
  }

  return { streakData, recordLearning }
})
