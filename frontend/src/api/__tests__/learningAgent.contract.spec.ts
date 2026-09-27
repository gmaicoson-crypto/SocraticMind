import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../index'
import { confirmAgentRun, startOnboarding } from '../agent'
import { replanStudyPlan } from '../plans'
import { getMemories } from '../memories'

vi.mock('../index', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('Learning Agent API contracts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('maps onboarding and confirm to the backend contract', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { run_id: 'run-1' } })
    const onboarding = {
      topic: 'TypeScript',
      goal: 'Learn',
      domain: 'software',
      outcome_type: 'concept' as const,
      familiarity: 'beginner' as const,
      daily_minutes: 30,
      timezone: 'UTC',
      use_diagnostic: true,
    }
    await startOnboarding(onboarding)
    await confirmAgentRun('run-1', 'confirm-123')
    expect(api.post).toHaveBeenNthCalledWith(1, '/api/agent/onboarding', onboarding)
    expect(api.post).toHaveBeenNthCalledWith(2, '/api/agent/runs/run-1/confirm', {
      request_id: 'confirm-123',
    })
  })

  it('maps plan and memory filters without changing field names', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} })
    vi.mocked(api.get).mockResolvedValue({ data: [] })
    await replanStudyPlan(7, 'replan-123', 'America/Los_Angeles')
    await getMemories({ topic_id: 3, kind: 'weakness' })
    expect(api.post).toHaveBeenCalledWith('/api/plans/7/replan', {
      request_id: 'replan-123',
      timezone: 'America/Los_Angeles',
    })
    expect(api.get).toHaveBeenCalledWith('/api/agent/memories', {
      params: { topic_id: 3, kind: 'weakness' },
    })
  })
})
