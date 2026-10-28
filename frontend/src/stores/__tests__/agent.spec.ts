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

  it('ignores a conflict refresh that finishes after navigating to another session', async () => {
    const store = useAgentStore()
    store.run = run()
    vi.mocked(agentApi.answerAgentRun).mockRejectedValue({ response: { status: 409 } })
    let resolveRefresh!: (value: AgentRun) => void
    vi.mocked(agentApi.getAgentRun).mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve
      }),
    )
    const pending = store.answer('answer')
    await vi.waitFor(() => expect(agentApi.getAgentRun).toHaveBeenCalled())
    store.clearRun()
    store.run = run({ run_id: 'new-session-run' })
    resolveRefresh(run({ version: 2 }))
    await pending
    expect(store.run.run_id).toBe('new-session-run')
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

  it('exposes retrying state while a failed run is being retried', async () => {
    let resolveRequest: (value: AgentRun) => void = () => undefined
    vi.mocked(agentApi.retryAgentRun).mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve
      }),
    )
    const store = useAgentStore()
    store.run = run({
      status: 'failed',
      step: null,
      error: { code: 'AI_TIMEOUT', retryable: true },
    })

    const pending = store.retry()
    expect(store.retrying).toBe(true)
    expect(store.submitting).toBe(true)

    resolveRequest(run({ status: 'diagnosing', step: null, error: null }))
    await pending

    expect(store.retrying).toBe(false)
    expect(store.submitting).toBe(false)
    expect(store.run?.status).toBe('diagnosing')
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

  it('explains the run budget and does not offer an ineffective retry', async () => {
    vi.mocked(agentApi.getAgentRun).mockResolvedValue(
      run({
        status: 'failed',
        step: null,
        error: { code: 'AGENT_MODEL_BUDGET_EXHAUSTED', retryable: false },
      }),
    )
    const store = useAgentStore()
    await store.restoreRun('run-1')
    expect(store.error?.message).toContain('模型尝试次数已达上限')
    expect(store.canRetry).toBe(false)
  })

  it('keeps a regeneration request identity after a lost response', async () => {
    const store = useAgentStore()
    store.run = run({ status: 'awaiting_confirmation', step: null, version: 5 })
    vi.mocked(agentApi.updateAgentRun).mockRejectedValueOnce(new Error('offline'))
    await store.update({ regenerate: true })
    vi.mocked(agentApi.updateAgentRun).mockResolvedValueOnce(
      run({ status: 'awaiting_confirmation', version: 8 }),
    )
    await store.update({ regenerate: true })
    const first = vi.mocked(agentApi.updateAgentRun).mock.calls[0]![1]
    const second = vi.mocked(agentApi.updateAgentRun).mock.calls[1]![1]
    expect(first).toEqual(second)
    expect(first).toEqual(
      expect.objectContaining({ regenerate: true, version: 5, request_id: expect.any(String) }),
    )
  })
})
