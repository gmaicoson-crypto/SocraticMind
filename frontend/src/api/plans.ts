import api from './index'
import type { StudyPlan, TodayPlan } from '../types/learningAgent'

export async function getTodayPlan(timezone?: string) {
  const response = await api.get('/api/plans/today', {
    params: timezone ? { timezone } : {},
  })
  return response.data as TodayPlan
}

export async function getTopicPlan(topicId: number) {
  const response = await api.get(`/api/topics/${topicId}/plan`)
  return response.data as StudyPlan
}

export async function replanStudyPlan(planId: number, requestId: string, timezone?: string) {
  const response = await api.post(`/api/plans/${planId}/replan`, {
    request_id: requestId,
    ...(timezone ? { timezone } : {}),
  })
  return response.data as StudyPlan
}
