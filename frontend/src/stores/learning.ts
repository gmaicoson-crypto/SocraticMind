import { defineStore, storeToRefs } from 'pinia'
import { useDialogueStore } from './dialogue'
import { useProgressStore } from './progress'
import { useTopicsStore } from './topics'
import { useUiStore } from './ui'
import { useUserStore } from './user'
import { useAgentStore } from './agent'
import { usePlansStore } from './plans'

export const useLearningStore = defineStore('learning', () => {
  const uiStore = useUiStore()
  const userStore = useUserStore()
  const topicsStore = useTopicsStore()
  const dialogueStore = useDialogueStore()
  const progressStore = useProgressStore()
  const agentStore = useAgentStore()
  const plansStore = usePlansStore()

  const { isDark } = storeToRefs(uiStore)
  const { userInfo } = storeToRefs(userStore)
  const {
    nodes,
    edges,
    topics,
    activeTopicId,
    activeNode,
    nodeDialogueRequest,
    lastMasteredId,
    recommendations,
    masteredCount,
    totalCount,
    availableCount,
    overallProgress,
  } = storeToRefs(topicsStore)
  const { messages, pendingTopicOverviewId } = storeToRefs(dialogueStore)
  const { streakData } = storeToRefs(progressStore)
  const { run: agentRun, submitting: agentSubmitting, error: agentError } = storeToRefs(agentStore)
  const { todayPlan, replanning } = storeToRefs(plansStore)

  return {
    isDark,
    userInfo,
    nodes,
    edges,
    topics,
    activeTopicId,
    activeNode,
    nodeDialogueRequest,
    lastMasteredId,
    recommendations,
    messages,
    pendingTopicOverviewId,
    streakData,
    masteredCount,
    totalCount,
    availableCount,
    overallProgress,
    agentRun,
    agentSubmitting,
    agentError,
    todayPlan,
    replanning,
    toggleTheme: uiStore.toggleTheme,
    setUserInfo: userStore.setUserInfo,
    loadUserFromStorage: userStore.loadUserFromStorage,
    fetchTopics: topicsStore.fetchTopics,
    fetchNodes: topicsStore.fetchNodes,
    fetchTopicsOnly: topicsStore.fetchTopicsOnly,
    fetchRecommendations: topicsStore.fetchRecommendations,
    setActiveTopic: topicsStore.setActiveTopic,
    setActiveNode: topicsStore.setActiveNode,
    requestNodeDialogue: topicsStore.requestNodeDialogue,
    clearGraph: topicsStore.clearGraph,
    addMessage: dialogueStore.addMessage,
    requestTopicOverview: dialogueStore.requestTopicOverview,
    recordLearning: progressStore.recordLearning,
    beginOnboarding: agentStore.beginOnboarding,
    openOnboarding: agentStore.openOnboarding,
    openTopicPlan: agentStore.openTopicPlan,
    restoreAgentRun: agentStore.restoreRun,
    answerAgentRun: agentStore.answer,
    fetchTodayPlan: plansStore.fetchToday,
    replanStudyPlan: plansStore.replan,
    replanOverduePlans: plansStore.replanOverdue,
  }
})
