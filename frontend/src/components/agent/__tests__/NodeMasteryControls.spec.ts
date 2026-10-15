import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import NodeMasteryControls from '../NodeMasteryControls.vue'
import type { KNode } from '../../../types'
import type { AssessmentResult } from '../../../types/learningAgent'

const assessmentResult: AssessmentResult = {
  node_id: 20,
  node_label: '数组',
  scores: [],
  total_score: 80,
  evidence: '理解基础概念',
  weaknesses: [],
  passed: true,
  professional_review_required: false,
  threshold: { minimum_score: 75 },
  next_actions: ['continue_plan'],
}

const node = (state: KNode['state']): KNode => ({
  id: 'arrays',
  dbId: 20,
  label: '数组',
  sub: 'Array',
  x: 0,
  y: 0,
  state,
})

describe('NodeMasteryControls', () => {
  it('offers both explicit mastery paths for an available node', () => {
    const wrapper = mount(NodeMasteryControls, { props: { node: node('available') } })
    expect(wrapper.text()).toContain('开始评估')
    expect(wrapper.text()).toContain('自报掌握')
    expect(wrapper.find('.mastery-history').exists()).toBe(false)
    expect(
      wrapper.findAll('.mastery-actions button').every((button) => !button.attributes('disabled')),
    ).toBe(true)
  })

  it('disables mastery actions for a locked node', () => {
    const wrapper = mount(NodeMasteryControls, { props: { node: node('locked') } })
    expect(
      wrapper
        .findAll('.mastery-actions button')
        .every((button) => button.attributes('disabled') !== undefined),
    ).toBe(true)
  })

  it('shows the mastery source and revert action for a mastered node', () => {
    const wrapper = mount(NodeMasteryControls, {
      props: { node: { ...node('mastered'), masterySource: 'self_reported' } },
    })
    expect(wrapper.text()).toContain('用户自报')
    expect(wrapper.text()).toContain('撤销掌握')
  })

  it.each(['available', 'mastered', 'locked'] as const)(
    'allows viewing historical results for a %s node and disables the entry while busy',
    async (state) => {
      const wrapper = mount(NodeMasteryControls, {
        props: { node: { ...node(state), assessmentResult } },
      })
      const historyButton = wrapper.get('.mastery-footer .mastery-history')
      expect(historyButton.text()).toBe('查看历史评估结果')
      expect(historyButton.attributes('disabled')).toBeUndefined()
      await historyButton.trigger('click')
      expect(wrapper.emitted('viewAssessmentHistory')).toHaveLength(1)
      expect(wrapper.emitted('assess')).toBeUndefined()
      await wrapper.setProps({ busy: true })
      expect(historyButton.attributes('disabled')).toBeDefined()
      await historyButton.trigger('click')
      expect(wrapper.emitted('viewAssessmentHistory')).toHaveLength(1)
    },
  )

  it('collapses toward the suggestion boundary and reopens for another node', async () => {
    const wrapper = mount(NodeMasteryControls, {
      props: { node: node('available') },
      attachTo: document.body,
    })

    await wrapper.get('button[aria-label="收起当前知识节点卡片"]').trigger('click')
    expect(wrapper.get('.mastery-panel').attributes('aria-hidden')).toBe('true')
    expect(wrapper.get('.mastery-panel').attributes('inert')).toBeDefined()
    expect(document.activeElement).toBe(
      wrapper.get('button[aria-label="展开当前知识节点卡片"]').element,
    )
    expect(
      wrapper.get('button[aria-label="展开当前知识节点卡片"]').attributes('aria-expanded'),
    ).toBe('false')

    await wrapper.get('button[aria-label="展开当前知识节点卡片"]').trigger('click')
    expect(wrapper.get('.mastery-panel').attributes('aria-hidden')).toBe('false')
    expect(document.activeElement).toBe(
      wrapper.get('button[aria-label="收起当前知识节点卡片"]').element,
    )

    await wrapper.get('button[aria-label="收起当前知识节点卡片"]').trigger('click')
    await wrapper.setProps({ node: { ...node('available'), id: 'new-node' } })
    expect(wrapper.get('.mastery-panel').attributes('aria-hidden')).toBe('false')
    wrapper.unmount()
  })

  it('does not keep the expand button focused after a mouse collapse', async () => {
    const wrapper = mount(NodeMasteryControls, {
      props: { node: node('available') },
      attachTo: document.body,
    })
    const collapse = wrapper.get('button[aria-label="收起当前知识节点卡片"]')
    const collapseButton = collapse.element as HTMLButtonElement
    collapseButton.focus()

    collapseButton.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
    await nextTick()

    expect(wrapper.get('.mastery-panel').attributes('aria-hidden')).toBe('true')
    expect(document.activeElement).not.toBe(
      wrapper.get('button[aria-label="展开当前知识节点卡片"]').element,
    )
    wrapper.unmount()
  })
})
