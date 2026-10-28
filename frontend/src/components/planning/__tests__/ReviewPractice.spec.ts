import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ReviewPractice from '../ReviewPractice.vue'
import { answerReview, getReview } from '../../../api/reviews'

vi.mock('../../../api/reviews', () => ({ getReview: vi.fn(), answerReview: vi.fn() }))

const detail = {
  id: 7,
  version: 1,
  status: 'pending' as const,
  due_date: '2026-10-12',
  attempt_count: 0,
  node_label: '矩阵',
  previous_answer: '旧回答',
  feedback: '需要解释变换',
  step: {
    step_id: 'review-7',
    prompt: '如何理解矩阵？',
    input_type: 'text' as const,
    choices: [],
    current: 1,
    total: 1,
  },
}
const result = {
  review_id: 7,
  version: 2,
  passed: false,
  score: 2,
  evaluation_confidence: 0.9,
  critical_misconception: false,
  rationale: '还缺少实例',
  next_due_date: '2026-10-13',
}

describe('ReviewPractice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getReview).mockResolvedValue(detail)
    vi.mocked(answerReview).mockResolvedValue(result)
  })

  it('reuses the question card, submits the answer, and explains the next review date', async () => {
    const wrapper = mount(ReviewPractice, { props: { reviewId: 7, timezone: 'UTC' } })
    await flushPromises()
    expect(wrapper.text()).toContain('复习 1/1')
    expect(wrapper.text()).toContain('如何理解矩阵')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    await wrapper.get('textarea').setValue('  线性变换  ')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(answerReview).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ version: 1, answer: '线性变换', timezone: 'UTC' }),
    )
    expect(wrapper.get('time').attributes('datetime')).toBe('2026-10-13')
    expect(wrapper.get('time').text()).toMatch(/^(2026\/)?10\/13$/)
    expect(wrapper.text()).toContain('还缺少实例')
    expect(wrapper.emitted('completed')).toHaveLength(1)
    expect(wrapper.find('textarea').exists()).toBe(false)
  })

  it('keeps the request ID after a lost response and blocks double submission', async () => {
    let fail!: (error: Error) => void
    vi.mocked(answerReview).mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        fail = reject
      }),
    )
    const wrapper = mount(ReviewPractice, { props: { reviewId: 7, timezone: 'UTC' } })
    await flushPromises()
    await wrapper.get('textarea').setValue('线性变换')
    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')
    expect(answerReview).toHaveBeenCalledTimes(1)
    expect(wrapper.get('textarea').attributes('disabled')).toBeDefined()
    fail(new Error('网络暂不可用'))
    await flushPromises()
    expect(wrapper.text()).toContain('网络暂不可用')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(vi.mocked(answerReview).mock.calls[1]?.[1].request_id).toBe(
      vi.mocked(answerReview).mock.calls[0]?.[1].request_id,
    )
  })

  it('shows a stale-state refresh action and reloads the version', async () => {
    vi.mocked(answerReview).mockRejectedValueOnce({
      response: { data: { code: 'REVIEW_STATE_CONFLICT', message: '复习状态已更新' } },
    })
    const wrapper = mount(ReviewPractice, { props: { reviewId: 7, timezone: 'UTC' } })
    await flushPromises()
    await wrapper.get('textarea').setValue('回答')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    vi.mocked(getReview).mockResolvedValueOnce({ ...detail, version: 2, status: 'resolved' })
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('复习通过')
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('shows a frozen textbook location and blocks review after revocation', async () => {
    const source = {
      id: 's6',
      kind: 'document' as const,
      title: '矩阵教材',
      attachment_id: 'doc-1',
      revision: 1,
      chunk_id: 'c1',
      locator: { page: 7 },
      excerpt: '矩阵是线性变换的表示',
      retrieved_at: '2026-10-28T00:00:00Z',
    }
    vi.mocked(getReview).mockResolvedValueOnce({ ...detail, sources: [source] })
    const wrapper = mount(ReviewPractice, { props: { reviewId: 7, timezone: 'UTC' } })
    await flushPromises()
    expect(wrapper.get('.file-source').text()).toContain('矩阵教材')
    expect(wrapper.get('.file-source').text()).toContain('7')
    wrapper.unmount()
    vi.mocked(getReview).mockResolvedValueOnce({
      ...detail,
      evidence_unavailable: true,
      sources: [{ ...source, excerpt: '', deleted: true }],
    })
    const revoked = mount(ReviewPractice, { props: { reviewId: 7, timezone: 'UTC' } })
    await flushPromises()
    expect(revoked.text()).toContain('原教材已失效')
    expect(revoked.text()).not.toContain(source.excerpt)
    expect(revoked.get('.file-source').attributes('disabled')).toBeDefined()
    await revoked.get('form').trigger('submit')
    expect(answerReview).not.toHaveBeenCalled()
    revoked.unmount()
  })
})
