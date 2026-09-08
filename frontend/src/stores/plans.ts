import { ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { getTodayPlan, getTopicPlan, replanStudyPlan } from '../api/plans'
import { parseApiError } from '../api'
import type { ApiProblem } from '../api'
import type { StudyPlan, TodayPlan } from '../types/learningAgent'
import { createRequestId } from '../utils/requestId'

export const usePlansStore = defineStore('plans', () => {
  const todayPlan = shallowRef<TodayPlan | null>(null)
  const topicPlan = shallowRef<StudyPlan | null>(null)
  const loading = ref(false)
  const replanning = ref(false)
  const error = shallowRef<ApiProblem | null>(null)
  const requestIds = new Map<number, string>()
  let activeReplan: Promise<StudyPlan | null> | null = null

  async function fetchToday(timezone?: string) {
    loading.value = true
    error.value = null
    try {
      todayPlan.value = await getTodayPlan(timezone)
      return todayPlan.value
    } catch (cause) {
      error.value = parseApiError(cause)
      return null
    } finally {
      loading.value = false
    }
  }

  async function fetchTopicPlan(topicId: number) {
    loading.value = true
    error.value = null
    try {
      topicPlan.value = await getTopicPlan(topicId)
      return topicPlan.value
    } catch (cause) {
      error.value = parseApiError(cause)
      return null
    } finally {
      loading.value = false
    }
  }

  function replan(planId: number, timezone?: string) {
    if (activeReplan) return activeReplan
    replanning.value = true
    error.value = null
    const stableId = requestIds.get(planId) ?? createRequestId('replan')
    requestIds.set(planId, stableId)
    activeReplan = (async () => {
      try {
        topicPlan.value = await replanStudyPlan(planId, stableId, timezone)
        requestIds.delete(planId)
        return topicPlan.value
      } catch (cause) {
        error.value = parseApiError(cause)
        return null
      } finally {
        replanning.value = false
        activeReplan = null
      }
    })()
    return activeReplan
  }

  function clearPlans() {
    todayPlan.value = null
    topicPlan.value = null
    error.value = null
    requestIds.clear()
  }

  return {
    todayPlan, topicPlan, loading, replanning, error,
    fetchToday, fetchTopicPlan, replan, clearPlans,
  }
})
