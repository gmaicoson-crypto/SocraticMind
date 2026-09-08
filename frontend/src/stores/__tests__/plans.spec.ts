import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import * as plansApi from '../../api/plans'
import type { StudyPlan, TodayPlan } from '../../types/learningAgent'
import { usePlansStore } from '../plans'

vi.mock('../../api/plans', () => ({
  getTodayPlan: vi.fn(),
  getTopicPlan: vi.fn(),
  replanStudyPlan: vi.fn(),
}))

const today: TodayPlan = {
  date: '2026-09-07',
  effective_timezone: 'UTC',
  replan_suggested: false,
  today: [], overdue: [], upcoming: [],
}

const plan: StudyPlan = {
  id: 4,
  topic_id: 2,
  goal: 'Learn',
  domain: 'software',
  outcome_type: 'concept',
  daily_minutes: 30,
  timezone: 'UTC',
  start_date: '2026-09-07',
  target_date: null,
  estimated_end_date: '2026-09-08',
  status: 'active',
  version: 2,
  will_miss_target: false,
  total_minutes: 30,
  completed_minutes: 0,
  items: [],
}

describe('plans store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('loads grouped plan data', async () => {
    vi.mocked(plansApi.getTodayPlan).mockResolvedValue(today)
    const store = usePlansStore()
    await store.fetchToday('UTC')
    expect(store.todayPlan).toEqual(today)
  })

  it('locks duplicate replans and reuses one stable request id', async () => {
    let resolveRequest: (value: StudyPlan) => void = () => undefined
    vi.mocked(plansApi.replanStudyPlan).mockReturnValue(
      new Promise(resolve => { resolveRequest = resolve }),
    )
    const store = usePlansStore()

    const first = store.replan(4, 'UTC')
    const second = store.replan(4, 'UTC')
    expect(plansApi.replanStudyPlan).toHaveBeenCalledTimes(1)
    const requestId = vi.mocked(plansApi.replanStudyPlan).mock.calls[0][1]
    expect(requestId).toMatch(/^replan-/)

    resolveRequest(plan)
    await Promise.all([first, second])
    expect(store.topicPlan).toEqual(plan)
    expect(store.replanning).toBe(false)
  })

  it('keeps the id after failure and releases it after success', async () => {
    vi.mocked(plansApi.replanStudyPlan)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(plan)
      .mockResolvedValueOnce({ ...plan, version: 3 })
    const store = usePlansStore()

    await store.replan(4, 'UTC')
    await store.replan(4, 'UTC')
    await store.replan(4, 'UTC')

    const calls = vi.mocked(plansApi.replanStudyPlan).mock.calls
    expect(calls[0][1]).toBe(calls[1][1])
    expect(calls[2][1]).not.toBe(calls[1][1])
  })

  it('replans each overdue plan once and replaces today data from the server', async () => {
    const refreshed = { ...today, date: '2026-09-08' }
    vi.mocked(plansApi.replanStudyPlan).mockResolvedValue(plan)
    vi.mocked(plansApi.getTodayPlan).mockResolvedValue(refreshed)
    const store = usePlansStore()

    const result = await store.replanOverdue([4, 4, 5], 'UTC')

    expect(plansApi.replanStudyPlan).toHaveBeenCalledTimes(2)
    expect(plansApi.getTodayPlan).toHaveBeenCalledWith('UTC')
    expect(result).toEqual(refreshed)
    expect(store.todayPlan).toEqual(refreshed)
  })
})
