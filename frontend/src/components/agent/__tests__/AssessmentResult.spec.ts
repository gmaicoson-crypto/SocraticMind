import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AssessmentResult from '../AssessmentResult.vue'
import type { AssessmentResult as AssessmentResultData } from '../../../types/learningAgent'

const result: AssessmentResultData = {
  node_id: 20, node_label: '数组',
  scores: [{ question_id: 'q1', score: 3, rationale: '概念正确但例子不足' }],
  total_score: 8, evaluation_confidence: 0.82, critical_misconception: false,
  evidence: '基础概念清楚', weaknesses: ['边界条件'], passed: false,
  professional_review_required: false,
  threshold: { minimum_score: 9, minimum_confidence: 0.7, requires_no_critical_misconception: true },
  next_actions: ['continue_learning', 'retry_assessment'],
}

describe('AssessmentResult', () => {
  it('shows evidence and exposes retry for a failed assessment', async () => {
    const wrapper = mount(AssessmentResult, { props: { result } })
    expect(wrapper.text()).toContain('8/12')
    expect(wrapper.text()).toContain('82%')
    expect(wrapper.text()).toContain('边界条件')
    expect(wrapper.text()).toContain('概念正确但例子不足')
    const retry = wrapper.findAll('button').find(button => button.text().includes('重新评估'))
    await retry!.trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })
})
