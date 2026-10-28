import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import {
  answerAgentRun,
  cancelAgentRun,
  confirmAgentRun,
  getAgentRun,
  getActiveAgentRuns,
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
import { pendingCreation } from '../utils/agentCreation'
import { getSelectedModelId } from '../utils/modelSelection'
import { createAgentPolling } from '../composables/agentPolling'

export const useAgentStore = defineStore('agent', () => {
  const run = shallowRef<AgentRun | null>(null)
  const loading = ref(false)
  const submitting = ref(false)
  const retrying = ref(false)
  const error = shallowRef<ApiProblem | null>(null)
  const onboardingTopic = ref<string | null>(null)
  const topicPlanDraft = shallowRef<{ topicId: number; title: string } | null>(null)
  const preview = computed(() => run.value?.preview ?? null)
  const result = computed(() => run.value?.result ?? null)
  const canRetry = computed(
    () => run.value?.status === 'failed' && Boolean(run.value.error?.retryable),
  )
  const requestIds = new Map<string, string>()
  let activeRunMutation: Promise<AgentRun | null> | null = null
  let activeMasteryMutation: Promise<MasteryResult | null> | null = null
  let runEpoch = 0
  let restoreSequence = 0
  const polling = createAgentPolling(
    (response) => {
      if (run.value?.run_id !== response.run_id) return false
      if (response.version >= run.value.version) acceptRun(response, false)
      return Boolean(run.value.processing)
    },
    (problem) => {
      error.value = problem
    },
  )

  function acceptRun(response: AgentRun, watchProgress = true) {
    run.value = response
    error.value = response.error
      ? {
          code: response.error.code,
          message:
            response.error.code === 'AGENT_MODEL_BUDGET_EXHAUSTED'
              ? '本次任务的模型尝试次数已达上限，请重新发起评估或学习任务'
              : response.error.retryable
                ? '流程执行失败，请重试'
                : '流程无法继续，请重新发起',
          retryable: response.error.retryable,
        }
      : null
    if (watchProgress) polling.start(response)
    return response
  }

  async function restoreActiveRun(sessionId: string) {
    const epoch = runEpoch
    const sequence = ++restoreSequence
    loading.value = true
    try {
      const responses = await getActiveAgentRuns(sessionId)
      if (epoch !== runEpoch || sequence !== restoreSequence || !responses.length) return null
      return acceptRun(responses[0]!)
    } catch (cause) {
      if (epoch === runEpoch && sequence === restoreSequence) error.value = parseApiError(cause)
      return null
    } finally {
      if (epoch === runEpoch && sequence === restoreSequence) loading.value = false
    }
  }

  function requestId(key: string, prefix: string) {
    const existing = requestIds.get(key)
    if (existing) return existing
    const created = createRequestId(prefix)
    requestIds.set(key, created)
    return created
  }

  async function restoreRun(runId: string) {
    const epoch = runEpoch
    const sequence = ++restoreSequence
    loading.value = true
    error.value = null
    try {
      const response = await getAgentRun(runId)
      if (epoch !== runEpoch || sequence !== restoreSequence) return null
      return acceptRun(response)
    } catch (cause) {
      if (epoch !== runEpoch || sequence !== restoreSequence) return null
      error.value = parseApiError(cause)
      return null
    } finally {
      if (epoch === runEpoch && sequence === restoreSequence) loading.value = false
    }
  }

  function mutateRun(request: () => Promise<AgentRun>, refreshOnConflict = true) {
    if (activeRunMutation) return activeRunMutation
    restoreSequence += 1
    loading.value = false
    const epoch = runEpoch
    submitting.value = true
    error.value = null
    const currentRunId = run.value?.run_id
    let operation: Promise<AgentRun | null> | null = null
    operation = (async () => {
      try {
        const response = await request()
        if (epoch !== runEpoch) return null
        return acceptRun(response)
      } catch (cause) {
        if (epoch !== runEpoch) return null
        const problem = parseApiError(cause)
        error.value = problem
        if (problem.status === 409 && currentRunId && refreshOnConflict) {
          try {
            const refreshed = await getAgentRun(currentRunId)
            if (epoch === runEpoch && run.value?.run_id === currentRunId) {
              acceptRun(refreshed)
              error.value = problem
            }
          } catch {
            // Preserve the conflict as the actionable error if refresh also fails.
          }
        }
        return null
      } finally {
        if (operation && activeRunMutation === operation) {
          submitting.value = false
          activeRunMutation = null
        }
      }
    })()
    activeRunMutation = operation
    return activeRunMutation
  }

  function beginOnboarding(input: OnboardingInput) {
    const creation = pendingCreation(`onboarding:${input.session_id ?? 'draft'}`, {
      input,
      model: getSelectedModelId(),
    })
    return mutateRun(
      () => startOnboarding({ ...input, request_id: input.request_id ?? creation.id }),
      false,
    ).then((response) => {
      if (response) creation.complete()
      return response
    })
  }

  function beginTopicPlan(topicId: number, input: TopicPlanInput) {
    const creation = pendingCreation(`plan:${topicId}:${input.session_id ?? 'draft'}`, {
      input,
      model: getSelectedModelId(),
    })
    return mutateRun(
      () => startTopicPlan(topicId, { ...input, request_id: input.request_id ?? creation.id }),
      false,
    ).then((response) => {
      if (response) creation.complete()
      return response
    })
  }

  function beginAssessment(nodeId: number, sessionId?: string) {
    const key = `assessment:${nodeId}`
    const id = requestId(key, 'assessment')
    return mutateRun(() => apiStartAssessment(nodeId, id, sessionId), false).then((response) => {
      if (response) requestIds.delete(key)
      return response
    })
  }

  function answer(answerText: string) {
    const current = run.value
    if (!current?.step) return Promise.resolve(null)
    return mutateRun(() =>
      answerAgentRun(current.run_id, {
        step_id: current.step!.step_id,
        version: current.version,
        answer: answerText,
      }),
    )
  }

  function update(input: AgentRunUpdate) {
    const current = run.value
    if (!current) return Promise.resolve(null)
    if (!input.regenerate) return mutateRun(() => updateAgentRun(current.run_id, input))
    const key = `regenerate:${current.run_id}:${current.version}:${JSON.stringify(input)}`
    const id = requestId(key, 'regenerate')
    return mutateRun(() =>
      updateAgentRun(current.run_id, {
        ...input,
        version: current.version,
        request_id: id,
      }),
    ).then((response) => {
      if (response) requestIds.delete(key)
      return response
    })
  }

  function confirm() {
    if (!run.value) return Promise.resolve(null)
    const runId = run.value.run_id
    const key = `confirm:${runId}`
    const id = requestId(key, 'confirm')
    const version = run.value.version
    return mutateRun(() => confirmAgentRun(runId, id, version)).then((response) => {
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
    retrying.value = true
    return mutateRun(() => retryAgentRun(run.value!.run_id)).finally(() => {
      retrying.value = false
    })
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
    return mutateMastery(() => apiSelfReportMastery(nodeId, id)).then((response) => {
      if (response) requestIds.delete(key)
      return response
    })
  }

  function revertMastery(nodeId: number) {
    const key = `revert:${nodeId}`
    const id = requestId(key, 'revert')
    return mutateMastery(() => apiRevertMastery(nodeId, id)).then((response) => {
      if (response) requestIds.delete(key)
      return response
    })
  }

  function clearRun() {
    polling.stop()
    runEpoch += 1
    activeRunMutation = null
    run.value = null
    error.value = null
    loading.value = false
    submitting.value = false
    retrying.value = false
    requestIds.clear()
  }

  function openOnboarding(topic: string) {
    if (run.value && !['completed', 'cancelled'].includes(run.value.status)) return false
    clearRun()
    topicPlanDraft.value = null
    onboardingTopic.value = topic.trim() || null
    return Boolean(onboardingTopic.value)
  }

  function closeOnboarding() {
    onboardingTopic.value = null
  }

  function openTopicPlan(topicId: number, title: string) {
    if (run.value && !['completed', 'cancelled'].includes(run.value.status)) return false
    clearRun()
    onboardingTopic.value = null
    topicPlanDraft.value = { topicId, title }
    return true
  }

  function closeTopicPlan() {
    topicPlanDraft.value = null
  }

  return {
    run,
    loading,
    submitting,
    retrying,
    error,
    onboardingTopic,
    topicPlanDraft,
    preview,
    result,
    canRetry,
    restoreRun,
    restoreActiveRun,
    stopPolling: polling.stop,
    getEpoch: () => runEpoch,
    beginOnboarding,
    beginTopicPlan,
    beginAssessment,
    answer,
    update,
    confirm,
    cancel,
    retry,
    selfReportMastery,
    revertMastery,
    clearRun,
    openOnboarding,
    closeOnboarding,
    openTopicPlan,
    closeTopicPlan,
  }
})
