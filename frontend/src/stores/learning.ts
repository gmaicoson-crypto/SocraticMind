import { defineStore, storeToRefs } from 'pinia'
import { useDialogueStore } from './dialogue'
import { useProgressStore } from './progress'
import { useTopicsStore } from './topics'
import { useUiStore } from './ui'
import { useUserStore } from './user'

export const useLearningStore = defineStore('learning', () => {
  const uiStore = useUiStore()
  const userStore = useUserStore()
  const topicsStore = useTopicsStore()
  const dialogueStore = useDialogueStore()
  const progressStore = useProgressStore()

  const { isDark } = storeToRefs(uiStore)
  const { userInfo } = storeToRefs(userStore)
  const { nodes, edges, topics, activeTopicId, activeNode, lastMasteredId, recommendations, masteredCount, totalCount, availableCount } = storeToRefs(topicsStore)
  const { messages, pendingTopicOverviewId } = storeToRefs(dialogueStore)
  const { streakData } = storeToRefs(progressStore)

  return {
    isDark, userInfo,
    nodes, edges, topics, activeTopicId, activeNode, lastMasteredId, recommendations,
    messages, pendingTopicOverviewId, streakData,
    masteredCount, totalCount, availableCount,
    toggleTheme: uiStore.toggleTheme,
    setUserInfo: userStore.setUserInfo,
    loadUserFromStorage: userStore.loadUserFromStorage,
    fetchTopics: topicsStore.fetchTopics,
    fetchNodes: topicsStore.fetchNodes,
    fetchTopicsOnly: topicsStore.fetchTopicsOnly,
    fetchRecommendations: topicsStore.fetchRecommendations,
    setActiveTopic: topicsStore.setActiveTopic,
    setActiveNode: topicsStore.setActiveNode,
    masterNode: topicsStore.masterNode,
    clearGraph: topicsStore.clearGraph,
    addMessage: dialogueStore.addMessage,
    requestTopicOverview: dialogueStore.requestTopicOverview,
    fetchStreak: progressStore.fetchStreak,
    recordLearning: progressStore.recordLearning,
  }
})
