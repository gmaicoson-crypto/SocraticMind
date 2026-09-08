import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import NodeMasteryControls from '../NodeMasteryControls.vue'
import type { KNode } from '../../../types'

const node = (state: KNode['state']): KNode => ({
  id: 'arrays', dbId: 20, label: '数组', sub: 'Array', x: 0, y: 0, state,
})

describe('NodeMasteryControls', () => {
  it('offers both explicit mastery paths for an available node', () => {
    const wrapper = mount(NodeMasteryControls, { props: { node: node('available') } })
    expect(wrapper.text()).toContain('开始评估')
    expect(wrapper.text()).toContain('自报掌握')
    expect(wrapper.findAll('button').every(button => !button.attributes('disabled'))).toBe(true)
  })

  it('disables mastery actions for a locked node', () => {
    const wrapper = mount(NodeMasteryControls, { props: { node: node('locked') } })
    expect(wrapper.findAll('button').every(button => button.attributes('disabled') !== undefined)).toBe(true)
  })

  it('shows the mastery source and revert action for a mastered node', () => {
    const wrapper = mount(NodeMasteryControls, {
      props: { node: { ...node('mastered'), masterySource: 'self_reported' } },
    })
    expect(wrapper.text()).toContain('用户自报')
    expect(wrapper.text()).toContain('撤销掌握')
  })
})
