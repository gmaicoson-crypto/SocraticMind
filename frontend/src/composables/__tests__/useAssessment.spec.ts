import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import * as agentApi from '../../api/agent'
import * as plansApi from '../../api/plans'
import * as topicApi from '../../api/topic'
import { useAssessment } from '../useAssessment'
import { useTopicsStore } from '../../stores/topics'
import type { AgentRun, AssessmentResult } from '../../types/learningAgent'

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
vi.mock('../../api/plans', () => ({
  getTodayPlan: vi.fn(),
  getTopicPlan: vi.fn(),
  replanStudyPlan: vi.fn(),
}))
vi.mock('../../api/topic', () => ({
  getNodes: vi.fn(),
  getTopics: vi.fn(),
  getRecommendations: vi.fn(),
}))

const result: AssessmentResult = {
  node_id: 20,
  node_label: '数组',
  scores: [
    { question_id: 'q1', score: 4, rationale: '准确' },
    { question_id: 'q2', score: 3, rationale: '基本准确' },
    { question_id: 'q3', score: 3, rationale: '表达清晰' },
  ],
  total_score: 10,
  evaluation_confidence: 0.9,
  critical_misconception: false,
  evidence: '能够解释核心概念',
  weaknesses: [],
  passed: true,
  professional_review_required: false,
  threshold: {
    minimum_score: 9,
    minimum_confidence: 0.7,
    requires_no_critical_misconception: true,
  },
  next_actions: ['continue_plan', 'revert_mastery'],
}
const activeRun: AgentRun = {
  run_id: 'assessment-1',
  type: 'assessment',
  status: 'assessing',
  version: 1,
  step: { step_id: 'q1', prompt: '问题', input_type: 'text', choices: [], current: 1, total: 3 },
  preview: null,
  result: null,
  error: null,
}
const completedRun: AgentRun = {
  ...activeRun,
  status: 'completed',
  version: 4,
  step: null,
  result,
}
const serverNodes: topicApi.NodeData[] = [
  {
    id: 20,
    node_key: 'arrays',
    label: '数组',
    sub: '',
    state: 'mastered',
    x: 0,
    y: 0,
    parent_keys: '',
    estimated_minutes: 30,
    mastery_source: 'assessment',
    mastery_confidence: 0.9,
    assessment_result: result,
  },
  {
    id: 21,
    node_key: 'lists',
    label: '链表',
    sub: '',
    state: 'available',
    x: 10,
    y: 10,
    parent_keys: 'arrays',
    estimated_minutes: 30,
    mastery_source: null,
    mastery_confidence: null,
    assessment_result: null,
  },
]

describe('useAssessment', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    })
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
    vi.mocked(topicApi.getTopics).mockResolvedValue([
      { id: 2, title: '数据结构', emoji: 'D', total_nodes: 2, mastered_nodes: 1 },
    ])
    vi.mocked(topicApi.getNodes).mockResolvedValue(serverNodes)
    vi.mocked(plansApi.getTodayPlan).mockResolvedValue({
      date: '2026-09-07',
      effective_timezone: 'UTC',
      replan_suggested: false,
      today: [],
      overdue: [],
      upcoming: [],
    })
  })

  it('indexes an active assessment and refreshes authoritative state after completion', async () => {
    vi.mocked(agentApi.startAssessment).mockResolvedValue(activeRun)
    vi.mocked(agentApi.answerAgentRun).mockResolvedValue(completedRun)
    const topics = useTopicsStore()
    topics.activeTopicId = '2'
    const celebrate = vi.spyOn(topics, 'notifyMastery')
    const flow = useAssessment({ userId: () => 5, sessionId: () => 'session-1' })

    await flow.start(20)
    expect(localStorage.getItem('sm_agent_runs_5')).toContain('assessment-1')
    await flow.answer('答案')

    expect(localStorage.getItem('sm_agent_runs_5')).toBeNull()
    expect(topicApi.getNodes).toHaveBeenCalledWith(2)
    expect(topics.activeNode?.masterySource).toBe('assessment')
    expect(topics.nodes.find((node) => node.dbId === 21)?.state).toBe('available')
    expect(celebrate).toHaveBeenCalledWith('arrays')
  })

  it('self report refreshes nodes without synthesizing descendant state locally', async () => {
    vi.mocked(agentApi.selfReportMastery).mockResolvedValue({
      event_id: 3,
      node_id: 20,
      state: 'mastered',
      refresh_required: true,
    })
    const topics = useTopicsStore()
    topics.activeTopicId = '2'
    const flow = useAssessment({ userId: () => 5, sessionId: () => 'session-1' })

    await flow.selfReport(20)

    expect(agentApi.selfReportMastery).toHaveBeenCalled()
    expect(topicApi.getNodes).toHaveBeenCalledWith(2)
    expect(topics.nodes.map((node) => node.state)).toEqual(['mastered', 'available'])
  })
})
