import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import * as agentApi from '../../api/agent'
import type { AgentRun, OnboardingInput } from '../../types/learningAgent'
import { useOnboardingFlow } from '../useOnboardingFlow'

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
const active: AgentRun = {
  run_id: 'run-1',
  type: 'onboarding',
  status: 'awaiting_confirmation',
  version: 2,
  step: null,
  preview: null,
  result: null,
  error: null,
}

describe('useOnboardingFlow', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('indexes active runs and clears the index after confirmation', async () => {
    const completed = {
      ...active,
      status: 'completed' as const,
      version: 3,
      result: { topic_id: 9, plan_id: 4 },
    }
    vi.mocked(agentApi.startOnboarding).mockResolvedValue(active)
    vi.mocked(agentApi.confirmAgentRun).mockResolvedValue(completed)
    const onCompleted = vi.fn()
    const flow = useOnboardingFlow({
      userId: () => 5,
      sessionId: () => 'session-1',
      onCompleted,
    })

    await flow.start(input)
    expect(localStorage.getItem('sm_agent_runs_5')).toContain('run-1')
    await flow.confirm()
    expect(localStorage.getItem('sm_agent_runs_5')).toBeNull()
    expect(onCompleted).toHaveBeenCalledWith(completed)
  })

  it('restores the saved second step without starting a new run', async () => {
    const secondStep = {
      ...active,
      status: 'diagnosing' as const,
      version: 4,
      step: {
        step_id: 'diagnostic-question-2',
        prompt: 'Second?',
        input_type: 'text',
        choices: [],
        current: 2,
        total: 3,
      },
    }
    localStorage.setItem('sm_agent_runs_5', JSON.stringify({ 'session-1': 'run-1' }))
    vi.mocked(agentApi.getAgentRun).mockResolvedValue(secondStep)
    const flow = useOnboardingFlow({ userId: () => 5, sessionId: () => 'session-1' })

    const restored = await flow.restore()

    expect(restored?.step?.current).toBe(2)
    expect(agentApi.getAgentRun).toHaveBeenCalledWith('run-1')
    expect(agentApi.startOnboarding).not.toHaveBeenCalled()
  })

  it('indexes an existing-topic plan run with the same recovery protocol', async () => {
    const topicRun = { ...active, type: 'topic_plan' as const }
    vi.mocked(agentApi.startTopicPlan).mockResolvedValue(topicRun)
    const flow = useOnboardingFlow({ userId: () => 5, sessionId: () => 'session-1' })
    const { topic: _topic, ...topicInput } = input

    await flow.startTopicPlan(9, topicInput)

    expect(agentApi.startTopicPlan).toHaveBeenCalledWith(9, {
      ...topicInput,
      request_id: expect.any(String),
    })
    expect(localStorage.getItem('sm_agent_runs_5')).toContain('run-1')
  })
})
