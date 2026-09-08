import api from './index'
import type {
  AgentRun,
  AgentRunUpdate,
  MasteryResult,
  OnboardingInput,
  TopicPlanInput,
} from '../types/learningAgent'

export async function startOnboarding(input: OnboardingInput) {
  const response = await api.post('/api/agent/onboarding', input)
  return response.data as AgentRun
}

export async function startTopicPlan(topicId: number, input: TopicPlanInput) {
  const response = await api.post(`/api/agent/topics/${topicId}/plan-runs`, input)
  return response.data as AgentRun
}

export async function getAgentRun(runId: string) {
  const response = await api.get(`/api/agent/runs/${runId}`)
  return response.data as AgentRun
}

export async function answerAgentRun(
  runId: string,
  input: { step_id: string; version: number; answer: string },
) {
  const response = await api.post(`/api/agent/runs/${runId}/answers`, input)
  return response.data as AgentRun
}

export async function updateAgentRun(runId: string, input: AgentRunUpdate) {
  const response = await api.patch(`/api/agent/runs/${runId}`, input)
  return response.data as AgentRun
}

export async function confirmAgentRun(runId: string, requestId: string) {
  const response = await api.post(`/api/agent/runs/${runId}/confirm`, {
    request_id: requestId,
  })
  return response.data as AgentRun
}

export async function cancelAgentRun(runId: string) {
  const response = await api.post(`/api/agent/runs/${runId}/cancel`)
  return response.data as AgentRun
}

export async function retryAgentRun(runId: string) {
  const response = await api.post(`/api/agent/runs/${runId}/retry`)
  return response.data as AgentRun
}

export async function startAssessment(
  nodeId: number,
  requestId: string,
  sessionId?: string,
) {
  const response = await api.post('/api/agent/assessments', {
    node_id: nodeId,
    request_id: requestId,
    session_id: sessionId,
  })
  return response.data as AgentRun
}

async function mutateMastery(path: string, requestId: string) {
  const response = await api.post(path, { request_id: requestId })
  return response.data as MasteryResult
}

export function selfReportMastery(nodeId: number, requestId: string) {
  return mutateMastery(`/api/nodes/${nodeId}/mastery`, requestId)
}

export function revertMastery(nodeId: number, requestId: string) {
  return mutateMastery(`/api/nodes/${nodeId}/mastery/revert`, requestId)
}
