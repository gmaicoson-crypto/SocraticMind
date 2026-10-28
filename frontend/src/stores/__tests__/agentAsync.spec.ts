import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { effectScope, nextTick } from 'vue'
import * as api from '../../api/agent'
import { useAgentStore } from '../agent'
import { useAgentRun } from '../../composables/useAgentRun'
import { useOnboardingFlow } from '../../composables/useOnboardingFlow'
import type { AgentRun, OnboardingInput } from '../../types/learningAgent'

vi.mock('../../api/agent', () => ({
  startOnboarding: vi.fn(),
  startTopicPlan: vi.fn(),
  getAgentRun: vi.fn(),
  getActiveAgentRuns: vi.fn(),
  answerAgentRun: vi.fn(),
  cancelAgentRun: vi.fn(),
  confirmAgentRun: vi.fn(),
  retryAgentRun: vi.fn(),
  updateAgentRun: vi.fn(),
  startAssessment: vi.fn(),
  selfReportMastery: vi.fn(),
  revertMastery: vi.fn(),
}))

const input: OnboardingInput = {
  topic: 'Rust',
  goal: 'Learn',
  domain: 'software',
  outcome_type: 'concept',
  familiarity: 'new',
  daily_minutes: 30,
  timezone: 'UTC',
  use_diagnostic: false,
  session_id: 'session-1',
}
const queued: AgentRun = {
  run_id: 'run-1',
  type: 'onboarding',
  status: 'drafting',
  version: 0,
  processing: true,
  stage: 'queued',
  session_id: 'session-1',
  step: null,
  preview: null,
  result: null,
  error: null,
}
const ready: AgentRun = {
  ...queued,
  status: 'awaiting_confirmation',
  version: 3,
  processing: false,
  stage: null,
}

describe('durable Agent frontend protocol', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    setActivePinia(createPinia())
    vi.mocked(api.startOnboarding).mockResolvedValue(queued)
  })
  afterEach(() => {
    useAgentStore().clearRun()
    vi.useRealTimers()
  })

  it('polls until a user-input boundary then stops', async () => {
    vi.mocked(api.getAgentRun)
      .mockResolvedValueOnce({ ...queued, version: 1, stage: 'graph_draft' })
      .mockResolvedValueOnce(ready)
    const store = useAgentStore()
    await store.beginOnboarding(input)
    expect(store.submitting).toBe(false)
    expect(store.run?.processing).toBe(true)
    await vi.advanceTimersByTimeAsync(1500)
    expect(store.run?.status).toBe('awaiting_confirmation')
    expect(api.getAgentRun).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(api.getAgentRun).toHaveBeenCalledTimes(2)
  })

  it('never overlaps polls and ignores a response after clearing the session', async () => {
    let resolve!: (value: AgentRun) => void
    vi.mocked(api.getAgentRun).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const store = useAgentStore()
    await store.beginOnboarding(input)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(api.getAgentRun).toHaveBeenCalledTimes(1)
    const signal = vi.mocked(api.getAgentRun).mock.calls[0]![1]!
    store.clearRun()
    expect(signal.aborted).toBe(true)
    resolve(ready)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(store.run).toBeNull()
    expect(api.getAgentRun).toHaveBeenCalledTimes(1)
  })

  it('backs off on temporary failure and keeps the durable run', async () => {
    vi.mocked(api.getAgentRun)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(ready)
    const store = useAgentStore()
    await store.beginOnboarding(input)
    await vi.advanceTimersByTimeAsync(500)
    expect(store.run?.run_id).toBe('run-1')
    await vi.advanceTimersByTimeAsync(1999)
    expect(api.getAgentRun).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(store.run?.processing).toBe(false)
    expect(store.error).toBeNull()
  })

  it('cancels polling and rejects a late success after cancellation', async () => {
    let resolve!: (value: AgentRun) => void
    vi.mocked(api.getAgentRun).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    vi.mocked(api.cancelAgentRun).mockResolvedValue({
      ...queued,
      status: 'cancelled',
      processing: false,
      version: 2,
    })
    const store = useAgentStore()
    await store.beginOnboarding(input)
    await vi.advanceTimersByTimeAsync(500)
    await store.cancel()
    resolve(ready)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(store.run?.status).toBe('cancelled')
    expect(api.getAgentRun).toHaveBeenCalledTimes(1)
  })

  it('preserves creation identity after a lost response and a reload', async () => {
    vi.mocked(api.startOnboarding).mockRejectedValueOnce(new Error('response lost'))
    await useAgentStore().beginOnboarding(input)
    const first = vi.mocked(api.startOnboarding).mock.calls[0]![0].request_id
    setActivePinia(createPinia())
    await useAgentStore().beginOnboarding(input)
    expect(vi.mocked(api.startOnboarding).mock.calls[1]![0].request_id).toBe(first)
    expect(first).toEqual(expect.any(String))
  })

  it('restores from the server when the browser never received a run id', async () => {
    vi.mocked(api.getActiveAgentRuns).mockResolvedValue([ready])
    const recovery = useAgentRun(5)
    const run = await recovery.restoreRun('session-1')
    expect(run?.run_id).toBe('run-1')
    expect(recovery.getRunId('session-1')).toBe('run-1')
    expect(api.startOnboarding).not.toHaveBeenCalled()
  })

  it('does not accept server recovery after navigating away', async () => {
    let resolve!: (value: AgentRun[]) => void
    vi.mocked(api.getActiveAgentRuns).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const restoring = useAgentRun(5).restoreRun('session-1')
    useAgentStore().clearRun()
    resolve([ready])
    expect(await restoring).toBeNull()
    expect(localStorage.getItem('sm_agent_runs_5')).toBeNull()
  })

  it('handles polled completion once and confirms the displayed version', async () => {
    const scope = effectScope()
    const completed = {
      ...ready,
      status: 'completed' as const,
      version: 5,
      result: { topic_id: 9, plan_id: 4 },
    }
    const onCompleted = vi.fn()
    const flow = scope.run(() =>
      useOnboardingFlow({ userId: () => 5, sessionId: () => 'session-1', onCompleted }),
    )!
    vi.mocked(api.startOnboarding).mockResolvedValue(ready)
    vi.mocked(api.confirmAgentRun).mockResolvedValue({
      ...ready,
      version: 4,
      processing: true,
      stage: 'confirm',
    })
    vi.mocked(api.getAgentRun).mockResolvedValue(completed)
    await flow.start(input)
    await flow.confirm()
    expect(api.confirmAgentRun).toHaveBeenCalledWith('run-1', expect.any(String), 3)
    await vi.advanceTimersByTimeAsync(500)
    await nextTick()
    expect(onCompleted).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('sm_agent_runs_5')).toBeNull()
    scope.stop()
  })
})
