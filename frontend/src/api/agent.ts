import api from './index'
import { getSelectedModelId } from '../utils/modelSelection'
import type {
  AgentRun,
  AgentRunUpdate,
  AssessmentHistoryPage,
  MasteryResult,
  OnboardingInput,
  TopicPlanInput,
} from '../types/learningAgent'

export async function startOnboarding(input: OnboardingInput) {
  const model = getSelectedModelId()
  const response = await api.post('/api/agent/onboarding', model ? { ...input, model } : input)
  return response.data as AgentRun
}

export async function startTopicPlan(topicId: number, input: TopicPlanInput) {
  const model = getSelectedModelId()
  const response = await api.post(
    `/api/agent/topics/${topicId}/plan-runs`,
    model ? { ...input, model } : input,
  )
  return response.data as AgentRun
}

export async function getAgentRun(runId: string, signal?: AbortSignal) {
  const response = await api.get(`/api/agent/runs/${runId}`, { signal })
  return response.data as AgentRun
}

export async function getActiveAgentRuns(sessionId: string) {
  const response = await api.get('/api/agent/runs/active', { params: { session_id: sessionId } })
  return response.data as AgentRun[]
}

export async function getNodeAssessmentHistory(nodeId: number, page = 1) {
  const response = await api.get(`/api/nodes/${nodeId}/assessments`, {
    params: { page },
  })
  return response.data as AssessmentHistoryPage
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

export async function confirmAgentRun(runId: string, requestId: string, version: number) {
  const response = await api.post(`/api/agent/runs/${runId}/confirm`, {
    request_id: requestId,
    version,
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

export async function startAssessment(nodeId: number, requestId: string, sessionId?: string) {
  const model = getSelectedModelId()
  const response = await api.post('/api/agent/assessments', {
    node_id: nodeId,
    request_id: requestId,
    session_id: sessionId,
    ...(model ? { model } : {}),
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
