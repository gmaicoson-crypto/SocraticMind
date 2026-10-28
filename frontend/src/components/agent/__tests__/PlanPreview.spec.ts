import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PlanPreview from '../PlanPreview.vue'
import type { PlanPreview as PlanPreviewData } from '../../../types/learningAgent'

const preview: PlanPreviewData = {
  topic: 'A very long learning topic that must wrap inside a narrow dialogue',
  emoji: 'T',
  goal: 'Understand it',
  domain: 'software',
  outcome_type: 'concept',
  diagnostic: null,
  nodes: [
    {
      key: 'root',
      label: 'A long node name that must remain readable',
      parent_keys: [],
      estimated_minutes: 30,
      x: 0,
      y: 0,
    },
  ],
  plan_items: [
    {
      node_key: 'root',
      scheduled_date: '2026-09-07',
      day_order: 1,
      estimated_minutes: 30,
      status: 'pending',
    },
  ],
  total_minutes: 30,
  daily_minutes: 30,
  start_date: '2026-09-07',
  estimated_end_date: '2026-09-07',
  target_date: null,
  will_miss_target: false,
  delay_days: 0,
  effective_timezone: 'UTC',
  risk_notice: null,
}

describe('PlanPreview', () => {
  it('shows compact plan cards and regenerates with the current preview parameters', async () => {
    const wrapper = mount(PlanPreview, { props: { preview } })
    expect(wrapper.text()).toContain(preview.topic)
    expect(wrapper.text()).toContain('1 个')
    expect(wrapper.findAll('.preview-section')).toHaveLength(2)
    expect(wrapper.find('input').exists()).toBe(false)
    const actions = wrapper.findAll('.tool-actions button')
    expect(actions.map((button) => button.text())).toEqual(['重新生成', '取消', '确认创建'])
    await actions[0].trigger('click')
    expect(wrapper.emitted('update')?.[0]?.[0]).toEqual({
      regenerate: true,
      goal: preview.goal,
      daily_minutes: preview.daily_minutes,
      target_date: preview.target_date,
    })
    await actions[2].trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)

    await wrapper.setProps({ busy: true })
    expect(actions.every((button) => button.attributes('disabled') !== undefined)).toBe(true)
  })

  it('shows the foundation test score and weaknesses without the internal level', () => {
    const wrapper = mount(PlanPreview, {
      props: {
        preview: {
          ...preview,
          diagnostic: {
            score: 82,
            level: 'foundation',
            domain: 'software',
            outcome_type: 'concept',
            strengths: [],
            weaknesses: ['概念辨析'],
            graph_guidance: [],
          },
        },
      },
    })
    const card = wrapper.get('.diagnostic-card')
    expect(card.text()).toContain('基础测试')
    expect(card.text()).toContain('82/100')
    expect(card.text()).toContain('薄弱点')
    expect(card.text()).toContain('概念辨析')
    expect(card.text()).not.toContain('foundation')
  })
})
