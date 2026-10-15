import api from './index'
import { getSelectedModelId } from '../utils/modelSelection'
import type { ReviewDetail, ReviewResult } from '../types/learningAgent'

export async function getReview(reviewId: number) {
  return (await api.get(`/api/plans/reviews/${reviewId}`)).data as ReviewDetail
}

export async function answerReview(
  reviewId: number,
  input: { request_id: string; version: number; answer: string; timezone: string },
) {
  const model = getSelectedModelId()
  return (
    await api.post(`/api/plans/reviews/${reviewId}/answers`, {
      ...input,
      ...(model ? { model } : {}),
    })
  ).data as ReviewResult
}
