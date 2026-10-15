import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AssessmentResult from '../AssessmentResult.vue'
import type { AssessmentResult as AssessmentResultData } from '../../../types/learningAgent'

const result: AssessmentResultData = {
  node_id: 20,
  node_label: '数组',
  scores: [1, 2, 3].map((index) => ({
    question_id: `q${index}`,
    score: 65 + index * 5,
    max_score: 100,
    question: `原题 ${index}：说明数组的边界条件`,
    answer: `我的回答 ${index}：数组访问需要检查下标`,
    reference_answer: `参考答案 ${index}：合法下标范围为 0 到数组长度减 1，需要排除负数、越界和空数组的访问。`,
    rationale: `解析 ${index}：说明了上界检查，但遗漏了负数下标`,
    mastery_analysis: `掌握情况 ${index}：理解索引访问，尚不能完整识别异常输入`,
    suggestions: [`建议 ${index}：分别用 -1、0 和长度作为下标进行验证`],
    rubric: [
      {
        criterion: `边界识别 ${index}`,
        observable_standards: ['同时说明上界与下界', '能用具体输入验证'],
      },
    ],
  })),
  total_score: 75,
  max_score: 100,
  evidence: '整体理解数组索引，仍需补齐异常输入的判断与验证能力。',
  weaknesses: ['边界条件'],
  remediation_route: [
    {
      title: '补齐边界判断',
      action: '画出合法索引范围，列出上下界。',
      checkpoint: '独立列出三类非法输入。',
    },
    {
      title: '用例验证',
      action: '针对空数组和负数索引编写用例。',
      checkpoint: '解释每个用例的预期结果。',
    },
  ],
  review_count: 3,
  passed: true,
  professional_review_required: false,
  threshold: { minimum_score: 75 },
  next_actions: ['continue_learning', 'retry_assessment'],
}

describe('AssessmentResult', () => {
  it.each([true, false])('keeps historical results read only for passed=%s', async (passed) => {
    const wrapper = mount(AssessmentResult, {
      props: { result: { ...result, passed }, readOnly: true },
    })
    expect(wrapper.findAll('.result-actions button').map((button) => button.text())).toEqual([
      '继续学习',
    ])
    await wrapper.findAll('.result-pages button')[1].trigger('click')
    expect(wrapper.text()).toContain(result.scores[0]!.question)
    expect(wrapper.text()).toContain(result.scores[0]!.answer)
    await wrapper.get('.result-actions button').trigger('click')
    expect(wrapper.emitted('continue')).toEqual([[]])
    expect(wrapper.emitted('revert')).toBeUndefined()
    expect(wrapper.emitted('retry')).toBeUndefined()
    wrapper.unmount()
  })

  it('separates the overview from detailed scores while preserving assessment actions', async () => {
    const wrapper = mount(AssessmentResult, { props: { result: { ...result, passed: false } } })
    expect(wrapper.text()).toContain('75/100')
    expect(wrapper.text()).toContain(result.evidence)
    expect(wrapper.text()).toContain('补齐边界判断')
    expect(wrapper.text()).toContain('独立列出三类非法输入。')
    expect(wrapper.text()).not.toContain('解析 1')
    expect(wrapper.find('.score-list').exists()).toBe(false)
    expect(wrapper.find('.result-summary').exists()).toBe(false)
    const pages = wrapper.findAll('.result-pages button')
    expect(pages.map((button) => button.text())).toEqual(['结果概览', '评分详情'])
    expect(pages[0].attributes('aria-current')).toBe('page')
    await pages[1].trigger('click')
    expect(pages[1].attributes('aria-current')).toBe('page')
    expect(wrapper.text()).not.toContain('置信度')
    expect(wrapper.text()).not.toContain('关键误解')
    expect(wrapper.text()).toContain('解析 1：说明了上界检查，但遗漏了负数下标')
    expect(wrapper.text()).toContain('第 1 题')
    expect(wrapper.text()).toContain('原题 1：说明数组的边界条件')
    expect(wrapper.text()).toContain('我的回答 1：数组访问需要检查下标')
    expect(wrapper.text()).toContain('参考答案 1：合法下标范围为 0 到数组长度减 1')
    expect(wrapper.get('.reference-context p').text()).toBe(result.scores[0]!.reference_answer)
    expect(
      wrapper.findAll('.score-card summary').every((summary) => !summary.text().includes('原题')),
    ).toBe(true)
    expect(wrapper.text()).toContain('掌握情况 1：理解索引访问，尚不能完整识别异常输入')
    expect(wrapper.text()).toContain('建议 1：分别用 -1、0 和长度作为下标进行验证')
    expect(wrapper.findAll('details')).toHaveLength(3)
    expect(wrapper.get('details').attributes('open')).toBeDefined()
    expect(wrapper.text()).not.toContain(result.evidence)
    expect(wrapper.find('.weaknesses').exists()).toBe(false)
    const retry = wrapper.findAll('button').find((button) => button.text().includes('重新评估'))
    await retry!.trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
    await pages[0].trigger('click')
    expect(wrapper.text()).toContain(result.evidence)
    expect(wrapper.find('.score-list').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows review guidance and professional review notices on the overview', () => {
    const wrapper = mount(AssessmentResult, {
      props: { result: { ...result, review_count: 2, professional_review_required: true } },
    })
    expect(wrapper.text()).toContain('2 道题')
    expect(wrapper.get('[aria-label="复习计划已安排"]').text()).toContain('今日复习')
    expect(wrapper.text()).toContain('已加入复习计划')
    expect(wrapper.text()).toContain('需要专业人员复核')
    expect(wrapper.find('.score-list').exists()).toBe(false)
    wrapper.unmount()
  })

  it('resets page scrolling on navigation and returns to the overview for a new result', async () => {
    const wrapper = mount(AssessmentResult, { props: { result } })
    const content = wrapper.get('.result-page').element as HTMLElement
    content.scrollTop = 120
    await wrapper.findAll('.result-pages button')[1].trigger('click')
    expect(content.scrollTop).toBe(0)
    content.scrollTop = 240
    await wrapper.setProps({ result: { ...result, node_label: '链表', node_id: 21 } })
    expect(wrapper.get('[aria-current="page"]').text()).toContain('结果概览')
    expect(wrapper.text()).toContain('链表')
    expect(wrapper.find('.score-list').exists()).toBe(false)
    expect(content.scrollTop).toBe(0)
    wrapper.unmount()
  })

  it('converts archived scores without restoring removed metrics or inventing detailed feedback', async () => {
    const legacy = {
      ...result,
      max_score: undefined,
      total_score: 8,
      remediation_route: undefined,
      scores: [{ question_id: 'old', score: 3, rationale: '历史评语' }],
      threshold: {
        minimum_score: 9,
        minimum_confidence: 0.7,
        requires_no_critical_misconception: true,
      },
      evaluation_confidence: 0.82,
      critical_misconception: false,
    }
    const wrapper = mount(AssessmentResult, { props: { result: legacy } })
    expect(wrapper.text()).toContain('67/100')
    expect(wrapper.text()).toContain('历史记录未包含补漏路线')
    await wrapper.findAll('.result-pages button')[1].trigger('click')
    expect(wrapper.text()).toContain('75/100')
    expect(wrapper.text()).toContain('历史评语')
    expect(wrapper.text()).toContain('未保存原题')
    expect(wrapper.get('.reference-context').text()).toContain('未保存参考答案')
    expect(wrapper.text()).not.toContain('置信度')
    expect(wrapper.text()).not.toContain('关键误解')
    expect(wrapper.find('.question-advice').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps a new low score on the 100-point scale', async () => {
    const wrapper = mount(AssessmentResult, {
      props: {
        result: { ...result, total_score: 3, scores: [{ ...result.scores[0]!, score: 3 }] },
      },
    })
    expect(wrapper.get('.total-score > strong').text()).toBe('3/100')
    await wrapper.findAll('.result-pages button')[1].trigger('click')
    expect(wrapper.get('.question-score').text()).toBe('3/100')
    wrapper.unmount()
  })

  it('opens the actual grading criteria from the score icon and dismisses the guide on demand', async () => {
    const wrapper = mount(AssessmentResult, { props: { result }, attachTo: document.body })
    const trigger = wrapper.get('button[aria-label="查看评分标准细则"]')
    expect(trigger.find('svg').exists()).toBe(true)
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('.scoring-guide-panel').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('百分制评分')
    await trigger.trigger('click')
    const guide = wrapper.get('[role="dialog"][aria-label="评分标准细则"]')
    expect(trigger.attributes('aria-expanded')).toBe('true')
    expect(trigger.attributes('aria-controls')).toBe(guide.attributes('id'))
    expect(guide.text()).toContain('总分 ≥ 75/100 即通过')
    expect(guide.text()).toContain('各维度得分相加得到单题分数')
    expect(guide.text()).toContain('边界识别 1')
    expect(guide.text()).toContain('同时说明上界与下界')
    expect(guide.text()).toContain('能用具体输入验证')
    expect(wrapper.text()).toContain(result.evidence)
    await wrapper.get('button[aria-label="关闭评分标准细则"]').trigger('click')
    expect(wrapper.find('.scoring-guide-panel').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
    await trigger.trigger('click')
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(trigger.attributes('aria-expanded')).toBe('false')
    await trigger.trigger('click')
    await trigger.trigger('click')
    expect(wrapper.find('.scoring-guide-panel').exists()).toBe(false)
    wrapper.unmount()
  })

  it('closes stale criteria when the result changes or an assessment action starts', async () => {
    const wrapper = mount(AssessmentResult, { props: { result } })
    const trigger = wrapper.get('button[aria-label="查看评分标准细则"]')
    await trigger.trigger('click')
    await wrapper.setProps({ busy: true })
    expect(trigger.attributes('disabled')).toBeDefined()
    expect(wrapper.find('.scoring-guide-panel').exists()).toBe(false)
    await wrapper.setProps({ busy: false })
    await trigger.trigger('click')
    await wrapper.setProps({ result: { ...result, node_id: 22, node_label: '队列' } })
    expect(wrapper.find('.scoring-guide-panel').exists()).toBe(false)
    wrapper.unmount()
  })

  it('explains archived grading rules without inventing missing criteria', async () => {
    const wrapper = mount(AssessmentResult, {
      props: {
        result: {
          ...result,
          max_score: undefined,
          total_score: 8,
          threshold: { minimum_score: 9 },
          professional_review_required: true,
          scores: [{ question_id: 'old', score: 3, rationale: '历史评语' }],
        },
      },
    })
    await wrapper.get('button[aria-label="查看评分标准细则"]').trigger('click')
    const guide = wrapper.get('.scoring-guide-panel')
    expect(guide.text()).toContain('通过线 75 分')
    expect(guide.text()).toContain('仍需专业人员复核')
    expect(guide.text()).toContain('历史结果保留原评估结论')
    expect(guide.text()).toContain('未保存本题评分量规')
    expect(guide.text()).not.toContain('置信度')
    expect(guide.text()).not.toContain('关键误解')
    wrapper.unmount()
  })

  it('shows frozen dimension weights, earned points, deduction rules and a reconciled subtotal', async () => {
    const labels = ['概念理解', '应用说明', '边界识别']
    const maximums = [40, 35, 25]
    const partials = [20, 15, 10]
    const earned = [40, 15, 0]
    const weighted = {
      ...result,
      scoring_version: 2,
      total_score: 55,
      scores: [
        {
          ...result.scores[0]!,
          score: 55,
          rubric: labels.map((criterion, index) => ({
            criterion_id: `c${index}`,
            criterion,
            max_score: maximums[index]!,
            observable_standards: ['说明具体依据'],
            scoring_rules: [
              { score: maximums[index]!, description: '完整说明要求，并给出正确例子。' },
              { score: partials[index]!, description: '概念描述正确，但遗漏具体例子。' },
              { score: 0, description: '没有回答该要求，或解释与基本概念矛盾。' },
            ],
          })),
          criterion_scores: earned
            .map((score, index) => ({
              criterion_id: `c${index}`,
              score,
              rationale: `回答依据 ${index + 1}`,
            }))
            .reverse(),
        },
      ],
    }
    const wrapper = mount(AssessmentResult, { props: { result: weighted } })
    await wrapper.get('button[aria-label="查看评分标准细则"]').trigger('click')
    const dimensions = wrapper.findAll('.criterion-breakdown')
    expect(dimensions).toHaveLength(3)
    expect(dimensions[1]!.text()).toContain('满分 35 分')
    expect(dimensions[1]!.get('.criterion-award').text()).toContain('实得 15 分')
    expect(dimensions[1]!.get('.criterion-award').text()).toContain('扣 20 分')
    expect(dimensions[1]!.get('.applied').text()).toContain('概念描述正确，但遗漏具体例子。')
    expect(dimensions[1]!.text()).toContain('回答依据 2')
    expect(dimensions[2]!.get('.applied').text()).toContain('得 0 分')
    expect(dimensions[2]!.get('.applied').text()).toContain('扣 25 分')
    expect(wrapper.get('.question-subtotal').text()).toContain('40 + 15 + 0 = 55/100')
    expect(wrapper.get('.rubric-description').text()).toContain('作答前确定')
    wrapper.unmount()
  })
})
