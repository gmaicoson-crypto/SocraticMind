import { useAgentStore } from '../stores/agent'
import type { AgentRun, AgentRunUpdate, OnboardingInput, TopicPlanInput } from '../types/learningAgent'
import { useAgentRun } from './useAgentRun'

interface OnboardingFlowOptions {
  userId: () => number | null | undefined
  sessionId: () => string
  onCompleted?: (run: AgentRun) => void | Promise<void>
}

const terminalStatuses = new Set(['completed', 'cancelled'])

export function useOnboardingFlow(options: OnboardingFlowOptions) {
  const agent = useAgentStore()

  function recovery() {
    const userId = options.userId()
    return userId ? useAgentRun(userId) : null
  }

  async function accept(response: AgentRun | null) {
    const index = recovery()
    if (!response || !index) return response
    if (terminalStatuses.has(response.status)) index.forgetRun(options.sessionId())
    else index.rememberRun(options.sessionId(), response.run_id)
    if (response.status === 'completed') await options.onCompleted?.(response)
    return response
  }

  async function start(input: OnboardingInput) {
    return accept(await agent.beginOnboarding(input))
  }

  async function startTopicPlan(topicId: number, input: TopicPlanInput) {
    return accept(await agent.beginTopicPlan(topicId, input))
  }

  async function restore() {
    const index = recovery()
    if (!index) return null
    return accept(await index.restoreRun(options.sessionId()))
  }

  async function answer(value: string) {
    return accept(await agent.answer(value))
  }

  async function update(input: AgentRunUpdate) {
    return accept(await agent.update(input))
  }

  async function confirm() {
    return accept(await agent.confirm())
  }

  async function cancel() {
    return accept(await agent.cancel())
  }

  async function retry() {
    return accept(await agent.retry())
  }

  return { agent, start, startTopicPlan, restore, answer, update, confirm, cancel, retry }
}
