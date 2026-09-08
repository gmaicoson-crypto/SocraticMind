import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import {
  answerAgentRun,
  cancelAgentRun,
  confirmAgentRun,
  getAgentRun,
  retryAgentRun,
  revertMastery as apiRevertMastery,
  selfReportMastery as apiSelfReportMastery,
  startAssessment as apiStartAssessment,
  startOnboarding,
  startTopicPlan,
  updateAgentRun,
} from '../api/agent'
import { parseApiError } from '../api'
import type { ApiProblem } from '../api'
import type {
  AgentRun,
  AgentRunUpdate,
  MasteryResult,
  OnboardingInput,
  TopicPlanInput,
} from '../types/learningAgent'
import { createRequestId } from '../utils/requestId'

export const useAgentStore = defineStore('agent', () => {
  const run = shallowRef<AgentRun | null>(null)
  const loading = ref(false)
  const submitting = ref(false)
  const error = shallowRef<ApiProblem | null>(null)
  const onboardingTopic = ref<string | null>(null)
  const preview = computed(() => run.value?.preview ?? null)
  const result = computed(() => run.value?.result ?? null)
  const canRetry = computed(() => run.value?.status === 'failed' && Boolean(run.value.error?.retryable))
  const requestIds = new Map<string, string>()
  let activeRunMutation: Promise<AgentRun | null> | null = null
  let activeMasteryMutation: Promise<MasteryResult | null> | null = null

  function acceptRun(response: AgentRun) {
    run.value = response
    error.value = response.error
      ? {
          code: response.error.code,
          message: '流程执行失败，请重试',
          retryable: response.error.retryable,
        }
      : null
    return response
  }

  function requestId(key: string, prefix: string) {
    const existing = requestIds.get(key)
    if (existing) return existing
    const created = createRequestId(prefix)
    requestIds.set(key, created)
    return created
  }

  async function restoreRun(runId: string) {
    loading.value = true
    error.value = null
    try {
      const response = await getAgentRun(runId)
      return acceptRun(response)
    } catch (cause) {
      error.value = parseApiError(cause)
      return null
    } finally {
      loading.value = false
    }
  }

  function mutateRun(request: () => Promise<AgentRun>, refreshOnConflict = true) {
    if (activeRunMutation) return activeRunMutation
    submitting.value = true
    error.value = null
    const currentRunId = run.value?.run_id
    activeRunMutation = (async () => {
      try {
        const response = await request()
        return acceptRun(response)
      } catch (cause) {
        const problem = parseApiError(cause)
        error.value = problem
        if (problem.status === 409 && currentRunId && refreshOnConflict) {
          try {
            run.value = await getAgentRun(currentRunId)
          } catch {
            // Preserve the conflict as the actionable error if refresh also fails.
          }
        }
        return null
      } finally {
        submitting.value = false
        activeRunMutation = null
      }
    })()
    return activeRunMutation
  }

  function beginOnboarding(input: OnboardingInput) {
    return mutateRun(() => startOnboarding(input), false)
  }

  function beginTopicPlan(topicId: number, input: TopicPlanInput) {
    return mutateRun(() => startTopicPlan(topicId, input), false)
  }

  function beginAssessment(nodeId: number, sessionId?: string) {
    const key = `assessment:${nodeId}`
    const id = requestId(key, 'assessment')
    return mutateRun(() => apiStartAssessment(nodeId, id, sessionId), false).then(response => {
      if (response) requestIds.delete(key)
      return response
    })
  }

  function answer(answerText: string) {
    const current = run.value
    if (!current?.step) return Promise.resolve(null)
    return mutateRun(() => answerAgentRun(current.run_id, {
      step_id: current.step!.step_id,
      version: current.version,
      answer: answerText,
    }))
  }

  function update(input: AgentRunUpdate) {
    if (!run.value) return Promise.resolve(null)
    return mutateRun(() => updateAgentRun(run.value!.run_id, input))
  }

  function confirm() {
    if (!run.value) return Promise.resolve(null)
    const runId = run.value.run_id
    const key = `confirm:${runId}`
    const id = requestId(key, 'confirm')
    return mutateRun(() => confirmAgentRun(runId, id)).then(response => {
      if (response) requestIds.delete(key)
      return response
    })
  }

  function cancel() {
    if (!run.value) return Promise.resolve(null)
    return mutateRun(() => cancelAgentRun(run.value!.run_id))
  }

  function retry() {
    if (!run.value) return Promise.resolve(null)
    return mutateRun(() => retryAgentRun(run.value!.run_id))
  }

  function mutateMastery(request: () => Promise<MasteryResult>) {
    if (activeMasteryMutation) return activeMasteryMutation
    submitting.value = true
    error.value = null
    activeMasteryMutation = (async () => {
      try {
        return await request()
      } catch (cause) {
        error.value = parseApiError(cause)
        return null
      } finally {
        submitting.value = false
        activeMasteryMutation = null
      }
    })()
    return activeMasteryMutation
  }

  function selfReportMastery(nodeId: number) {
    const key = `mastery:${nodeId}`
    const id = requestId(key, 'mastery')
    return mutateMastery(() => apiSelfReportMastery(nodeId, id)).then(response => {
      if (response) requestIds.delete(key)
      return response
    })
  }

  function revertMastery(nodeId: number) {
    const key = `revert:${nodeId}`
    const id = requestId(key, 'revert')
    return mutateMastery(() => apiRevertMastery(nodeId, id)).then(response => {
      if (response) requestIds.delete(key)
      return response
    })
  }

  function clearRun() {
    run.value = null
    error.value = null
    requestIds.clear()
  }

  function openOnboarding(topic: string) {
    if (run.value && !['completed', 'cancelled'].includes(run.value.status)) return false
    clearRun()
    onboardingTopic.value = topic.trim() || null
    return Boolean(onboardingTopic.value)
  }

  function closeOnboarding() {
    onboardingTopic.value = null
  }

  return {
    run, loading, submitting, error, onboardingTopic, preview, result, canRetry,
    restoreRun, beginOnboarding, beginTopicPlan, beginAssessment, answer,
    update, confirm, cancel, retry, selfReportMastery, revertMastery, clearRun,
    openOnboarding, closeOnboarding,
  }
})
