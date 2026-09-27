import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import * as agentApi from '../../api/agent'
import type { AgentRun, OnboardingInput } from '../../types/learningAgent'
import { useAgentStore } from '../agent'

vi.mock('../../api/agent', () => ({
  answerAgentRun: vi.fn(),
  cancelAgentRun: vi.fn(),
  confirmAgentRun: vi.fn(),
  getAgentRun: vi.fn(),
  retryAgentRun: vi.fn(),
  startAssessment: vi.fn(),
  startOnboarding: vi.fn(),
  startTopicPlan: vi.fn(),
  updateAgentRun: vi.fn(),
  selfReportMastery: vi.fn(),
  revertMastery: vi.fn(),
}))

const input: OnboardingInput = {
  topic: 'TypeScript',
  goal: 'Build safely',
  domain: 'software',
  outcome_type: 'procedure',
  familiarity: 'beginner',
  daily_minutes: 30,
  timezone: 'UTC',
  use_diagnostic: true,
  session_id: 'session-1',
}

function run(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    run_id: 'run-1',
    type: 'onboarding',
    status: 'diagnosing',
    version: 1,
    step: {
      step_id: 'step-1',
      prompt: 'Question?',
      input_type: 'text',
      choices: [],
      current: 1,
      total: 3,
    },
    preview: null,
    result: null,
    error: null,
    ...overrides,
  }
}

describe('agent store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('uses the server response as state and blocks duplicate submissions', async () => {
    let resolveRequest: (value: AgentRun) => void = () => undefined
    vi.mocked(agentApi.startOnboarding).mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve
      }),
    )
    const store = useAgentStore()

    const first = store.beginOnboarding(input)
    const second = store.beginOnboarding(input)
    expect(agentApi.startOnboarding).toHaveBeenCalledTimes(1)
    expect(store.submitting).toBe(true)

    resolveRequest(run())
    await Promise.all([first, second])
    expect(store.run?.run_id).toBe('run-1')
    expect(store.submitting).toBe(false)
  })

  it('refreshes authoritative run state after a 409 conflict', async () => {
    vi.mocked(agentApi.startOnboarding).mockResolvedValue(run())
    vi.mocked(agentApi.answerAgentRun).mockRejectedValue({
      response: {
        status: 409,
        data: { code: 'AGENT_STATE_CONFLICT', message: 'stale', retryable: false },
      },
    })
    vi.mocked(agentApi.getAgentRun).mockResolvedValue(
      run({ version: 2, step: { ...run().step!, current: 2, step_id: 'step-2' } }),
    )
    const store = useAgentStore()
    await store.beginOnboarding(input)

    await store.answer('answer')

    expect(agentApi.getAgentRun).toHaveBeenCalledWith('run-1')
    expect(store.run?.version).toBe(2)
    expect(store.error?.code).toBe('AGENT_STATE_CONFLICT')
  })

  it('preserves retryable API errors for the UI', async () => {
    vi.mocked(agentApi.startOnboarding).mockRejectedValue({
      response: {
        status: 503,
        data: { code: 'AI_TIMEOUT', message: '稍后重试', retryable: true },
      },
    })
    const store = useAgentStore()

    await store.beginOnboarding(input)

    expect(store.error).toEqual({
      code: 'AI_TIMEOUT',
      message: '稍后重试',
      retryable: true,
      status: 503,
    })
  })

  it('surfaces a persisted failed run returned with HTTP success', async () => {
    vi.mocked(agentApi.startOnboarding).mockResolvedValue(
      run({
        status: 'failed',
        step: null,
        error: { code: 'AI_SCHEMA_INVALID', retryable: true },
      }),
    )
    const store = useAgentStore()

    await store.beginOnboarding(input)

    expect(store.error?.code).toBe('AI_SCHEMA_INVALID')
    expect(store.canRetry).toBe(true)
  })

  it('ignores a run response that belongs to a session left while it was pending', async () => {
    let resolveRequest: (value: AgentRun) => void = () => undefined
    vi.mocked(agentApi.startOnboarding).mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve
      }),
    )
    const store = useAgentStore()
    const pending = store.beginOnboarding(input)

    store.clearRun()
    resolveRequest(run())

    await pending
    expect(store.run).toBeNull()
    expect(store.submitting).toBe(false)
  })

  it('does not restore a stale session after the current session changes', async () => {
    let resolveRequest: (value: AgentRun) => void = () => undefined
    vi.mocked(agentApi.getAgentRun).mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve
      }),
    )
    const store = useAgentStore()
    const pending = store.restoreRun('run-1')

    store.clearRun()
    resolveRequest(run())

    await pending
    expect(store.run).toBeNull()
    expect(store.loading).toBe(false)
  })
})
