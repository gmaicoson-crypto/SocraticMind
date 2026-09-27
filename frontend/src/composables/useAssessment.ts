import { useAgentStore } from '../stores/agent'
import { usePlansStore } from '../stores/plans'
import { useTopicsStore } from '../stores/topics'
import type { AgentRun } from '../types/learningAgent'
import { useAgentRun } from './useAgentRun'

interface AssessmentOptions {
  userId: () => number | null | undefined
  sessionId: () => string
}

const terminalStatuses = new Set(['completed', 'cancelled'])

export function useAssessment(options: AssessmentOptions) {
  const agent = useAgentStore()
  const topics = useTopicsStore()
  const plans = usePlansStore()

  function recovery() {
    const userId = options.userId()
    return userId ? useAgentRun(userId) : null
  }

  async function refreshNodeState(nodeId: number, celebrate = false) {
    const topicId = Number(topics.activeTopicId)
    await Promise.all([
      topics.fetchTopicsOnly(),
      topicId ? topics.fetchNodes(topicId) : Promise.resolve(),
      plans.fetchToday(),
    ])
    const selected = topics.nodes.find((node) => node.dbId === nodeId) ?? null
    topics.setActiveNode(selected)
    if (celebrate && selected?.state === 'mastered') topics.notifyMastery(selected.id)
  }

  async function accept(response: AgentRun | null, fallbackNodeId?: number) {
    if (!response) return null
    const index = recovery()
    if (index) {
      if (terminalStatuses.has(response.status)) index.forgetRun(options.sessionId())
      else index.rememberRun(options.sessionId(), response.run_id)
    }
    if (response.status === 'completed') {
      const resultNodeId = Number(
        response.result && 'node_id' in response.result ? response.result.node_id : fallbackNodeId,
      )
      if (resultNodeId) {
        const passed = Boolean(
          response.result && 'passed' in response.result && response.result.passed,
        )
        await refreshNodeState(resultNodeId, passed)
      }
    }
    return response
  }

  function start(nodeId: number) {
    return agent
      .beginAssessment(nodeId, options.sessionId())
      .then((response) => accept(response, nodeId))
  }

  function answer(value: string) {
    return agent.answer(value).then((response) => accept(response))
  }

  function retry() {
    return agent.retry().then((response) => accept(response))
  }

  function cancel() {
    return agent.cancel().then((response) => accept(response))
  }

  async function selfReport(nodeId: number) {
    const response = await agent.selfReportMastery(nodeId)
    if (response) await refreshNodeState(nodeId, true)
    return response
  }

  async function revert(nodeId: number) {
    const response = await agent.revertMastery(nodeId)
    if (response) await refreshNodeState(nodeId)
    return response
  }

  return { start, answer, retry, cancel, selfReport, revert, refreshNodeState }
}
