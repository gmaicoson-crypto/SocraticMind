import { watch } from 'vue'
import type {
  AgentRun,
  AgentRunUpdate,
  AssessmentResult as AssessmentResultData,
  OnboardingInput,
} from '../../types/learningAgent'
import { now } from '../../utils/chat'
import { useOnboardingFlow } from '../useOnboardingFlow'
import { useAssessment } from '../useAssessment'
import type { DialogueState } from './useDialogueState'

type Context = Pick<
  DialogueState,
  | 'agentStore'
  | 'assessmentResult'
  | 'currentSessionId'
  | 'store'
  | 'assessmentHistoryOpen'
  | 'currentSocraticSession'
  | 'inheritCurrentTopicAvatar'
  | 'saveSessions'
  | 'plansStore'
  | 'resetScrollToBottom'
  | 'scrollToBottom'
  | 'assessmentActive'
  | 'assessmentCanAnswer'
  | 'pushMessage'
  | 'currentStepInHistory'
  | 'isThinking'
  | 'startingAssessment'
  | 'blockDuringAssessment'
  | 'masteryConfirm'
>

export function useDialogueAgent(context: Context) {
  const {
    agentStore,
    assessmentResult,
    currentSessionId,
    store,
    assessmentHistoryOpen,
    currentSocraticSession,
    inheritCurrentTopicAvatar,
    saveSessions,
    plansStore,
    resetScrollToBottom,
    scrollToBottom,
    assessmentActive,
    assessmentCanAnswer,
    pushMessage,
    currentStepInHistory,
    isThinking,
    startingAssessment,
    blockDuringAssessment,
    masteryConfirm,
  } = context

  watch(
    () => agentStore.run,
    (run, previous) => {
      // Only a live completion opens the result; loading historical results stays silent.
      if (
        run?.type === 'assessment' &&
        run.status === 'completed' &&
        run.result &&
        'scores' in run.result &&
        previous?.run_id === run.run_id &&
        !['completed', 'cancelled'].includes(previous.status)
      ) {
        assessmentResult.value = run.result as AssessmentResultData
      }
    },
  )

  watch([currentSessionId, () => store.activeNode?.dbId], () => {
    assessmentResult.value = null
    assessmentHistoryOpen.value = false
  })

  const onboardingFlow = useOnboardingFlow({
    userId: () => store.userInfo?.id,
    sessionId: () => currentSessionId.value,
    onCompleted: handleOnboardingCompleted,
  })

  const assessmentFlow = useAssessment({
    userId: () => store.userInfo?.id,
    sessionId: () => currentSessionId.value,
  })

  async function handleOnboardingCompleted(run: AgentRun) {
    const result = run.result as Record<string, unknown> | null
    const topicId = Number(result?.topic_id)
    if (!topicId) return
    const title = run.preview?.topic ?? agentStore.onboardingTopic ?? '学习主题'
    const session = currentSocraticSession.value
    if (session) {
      inheritCurrentTopicAvatar(session, topicId)
      session.topicId = topicId
      session.topicTitle = title
      session.awaitingTopicChoice = false
      saveSessions()
    }
    agentStore.closeOnboarding()
    await store.fetchTopicsOnly()
    store.requestTopicOverview(topicId)
    await store.setActiveTopic(String(topicId))
    await plansStore.fetchToday(run.preview?.effective_timezone)
  }

  async function startLearningPlan(input: OnboardingInput) {
    resetScrollToBottom()
    const topicPlanDraft = agentStore.topicPlanDraft
    const response = topicPlanDraft
      ? await onboardingFlow.startTopicPlan(topicPlanDraft.topicId, withoutTopic(input))
      : await onboardingFlow.start(input)
    if (response) {
      agentStore.closeOnboarding()
      agentStore.closeTopicPlan()
    }
    scrollToBottom()
  }

  function withoutTopic(input: OnboardingInput) {
    const { topic: _topic, ...topicPlanInput } = input
    return topicPlanInput
  }

  function cancelOnboardingDraft() {
    agentStore.closeOnboarding()
    agentStore.closeTopicPlan()
  }

  async function submitChoiceAnswer(answer: string) {
    if (agentStore.submitting || (assessmentActive.value && !assessmentCanAnswer.value)) return
    const runId = agentStore.run?.run_id
    const stepId = agentStore.run?.step?.step_id
    recordCurrentAgentStep()
    if (runId && stepId) {
      pushMessage({
        role: 'user',
        text: answer,
        time: now(),
        messageType: 'agent_answer',
        metadata: { run_id: runId, step_id: stepId },
      })
    }
    resetScrollToBottom()
    await (agentStore.run?.type === 'assessment'
      ? assessmentFlow.answer(answer)
      : onboardingFlow.answer(answer))
    scrollToBottom()
  }

  function recordCurrentAgentStep() {
    const run = agentStore.run
    if (!run?.step || currentStepInHistory.value) return
    pushMessage({
      role: 'ai',
      text: run.step.prompt,
      time: now(),
      messageType: 'agent_step',
      metadata: { run_id: run.run_id, version: run.version, step_id: run.step.step_id },
    })
  }

  async function updatePlanPreview(input: AgentRunUpdate) {
    resetScrollToBottom()
    await onboardingFlow.update(input)
    scrollToBottom()
  }

  async function confirmPlan() {
    resetScrollToBottom()
    await onboardingFlow.confirm()
    scrollToBottom()
  }

  async function cancelAgentFlow() {
    resetScrollToBottom()
    const response = await (agentStore.run?.type === 'assessment'
      ? assessmentFlow.cancel()
      : onboardingFlow.cancel())
    if (response?.status === 'cancelled') {
      agentStore.closeOnboarding()
      agentStore.clearRun()
    }
    scrollToBottom()
  }

  async function retryAgentFlow() {
    resetScrollToBottom()
    await (agentStore.run?.type === 'assessment' ? assessmentFlow.retry() : onboardingFlow.retry())
    scrollToBottom()
  }

  async function startAssessment() {
    if (assessmentActive.value || agentStore.submitting || isThinking.value) return
    const nodeId = store.activeNode?.dbId
    if (!nodeId || store.activeNode?.state === 'locked') return
    assessmentResult.value = null
    assessmentHistoryOpen.value = false
    startingAssessment.value = true
    resetScrollToBottom()
    try {
      await assessmentFlow.start(nodeId)
    } finally {
      startingAssessment.value = false
    }
    scrollToBottom()
  }

  function continueLearning() {
    if (blockDuringAssessment()) return
    assessmentResult.value = null
    assessmentHistoryOpen.value = false
    agentStore.clearRun()
    resetScrollToBottom()
  }

  function viewAssessmentHistory() {
    if (blockDuringAssessment() || agentStore.submitting || !store.activeNode?.dbId) return
    assessmentResult.value = null
    assessmentHistoryOpen.value = true
  }

  function requestMasteryAction(action: 'self_report' | 'revert') {
    if (blockDuringAssessment()) return
    masteryConfirm.value = action
  }

  async function confirmMasteryAction() {
    if (blockDuringAssessment()) return
    const action = masteryConfirm.value
    const nodeId = store.activeNode?.dbId
    if (!action || !nodeId) return
    resetScrollToBottom()
    const response =
      action === 'revert'
        ? await assessmentFlow.revert(nodeId)
        : await assessmentFlow.selfReport(nodeId)
    if (response) {
      masteryConfirm.value = null
      if (action === 'revert') {
        assessmentResult.value = null
        agentStore.clearRun()
      }
    }
    scrollToBottom()
  }

  return {
    onboardingFlow,
    assessmentFlow,
    handleOnboardingCompleted,
    startLearningPlan,
    withoutTopic,
    cancelOnboardingDraft,
    submitChoiceAnswer,
    recordCurrentAgentStep,
    updatePlanPreview,
    confirmPlan,
    cancelAgentFlow,
    retryAgentFlow,
    startAssessment,
    continueLearning,
    viewAssessmentHistory,
    requestMasteryAction,
    confirmMasteryAction,
  }
}
