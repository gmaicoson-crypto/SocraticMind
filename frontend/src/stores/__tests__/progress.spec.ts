import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getStreak, recordToday } from '../../api/progress'
import { setAuth } from '../../utils/token'
import { useProgressStore } from '../progress'
import { useUserStore, type UserInfo } from '../user'

vi.mock('../../api/progress', () => ({ getStreak: vi.fn(), recordToday: vi.fn() }))

// The server reaches midnight while the browser is still in the same local day.
const dayEnds = new Date(2026, 10, 10, 12).getTime()
const streak = { streak: 3, total_days: 7, recent: [] }

function signIn(id: number) {
  const user: UserInfo = {
    id,
    username: 'learner',
    email: 'learner@example.com',
    avatar_url: '',
    ai_avatar_url: '',
    bio: '',
    daily_goal: 30,
    ai_style: '',
  }
  setAuth(`token-${id}`, user, false)
  useUserStore().setUserInfo(user)
}

describe('daily learning progress', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(dayEnds - 1)
    localStorage.clear()
    sessionStorage.clear()
    setActivePinia(createPinia())
    vi.mocked(recordToday).mockResolvedValue(dayEnds)
    vi.mocked(getStreak).mockResolvedValue(streak)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('skips synchronization until login', async () => {
    await useProgressStore().recordLearning()
    expect(recordToday).not.toHaveBeenCalled()
    expect(getStreak).not.toHaveBeenCalled()
  })

  it('shares one request pair across concurrent callers and refreshes after server midnight', async () => {
    signIn(1)
    const store = useProgressStore()
    await Promise.all([store.recordLearning(), store.recordLearning()])
    await store.recordLearning()

    expect(recordToday).toHaveBeenCalledTimes(1)
    expect(getStreak).toHaveBeenCalledTimes(1)
    expect(store.streakData).toEqual(streak)

    vi.setSystemTime(dayEnds)
    vi.mocked(recordToday).mockResolvedValue(dayEnds + 86_400_000)
    await store.recordLearning()
    await store.recordLearning()
    expect(recordToday).toHaveBeenCalledTimes(2)
    expect(getStreak).toHaveBeenCalledTimes(2)
  })

  it('retries a failed check-in and fetches the streak after it succeeds', async () => {
    signIn(1)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(recordToday).mockRejectedValueOnce(new Error('request failed'))
    const store = useProgressStore()

    await store.recordLearning()
    expect(getStreak).not.toHaveBeenCalled()

    await store.recordLearning()
    expect(recordToday).toHaveBeenCalledTimes(2)
    expect(getStreak).toHaveBeenCalledTimes(1)
    expect(store.streakData).toEqual(streak)
  })

  it('retries a failed streak request without recording the day again', async () => {
    signIn(1)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(getStreak).mockRejectedValueOnce(new Error('request failed'))
    const store = useProgressStore()

    await store.recordLearning()
    await store.recordLearning()
    await store.recordLearning()

    expect(recordToday).toHaveBeenCalledTimes(1)
    expect(getStreak).toHaveBeenCalledTimes(2)
    expect(store.streakData).toEqual(streak)
  })

  it('resets the cache on account changes and ignores a previous account response', async () => {
    signIn(1)
    const store = useProgressStore()
    let finishStreak!: (data: typeof streak) => void
    vi.mocked(getStreak).mockReturnValueOnce(new Promise((resolve) => (finishStreak = resolve)))
    const previous = store.recordLearning()
    await Promise.resolve()
    expect(getStreak).toHaveBeenCalledTimes(1)

    signIn(2)
    expect(store.streakData.streak).toBe(0)
    await store.recordLearning()
    expect(recordToday).toHaveBeenCalledTimes(2)
    expect(getStreak).toHaveBeenCalledTimes(2)
    finishStreak({ ...streak, streak: 99 })
    await previous
    expect(store.streakData).toEqual(streak)
  })
})
