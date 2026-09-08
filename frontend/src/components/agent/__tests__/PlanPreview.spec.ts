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
  nodes: [{
    key: 'root', label: 'A long node name that must remain readable', parent_keys: [],
    estimated_minutes: 30, x: 0, y: 0,
  }],
  plan_items: [{
    node_key: 'root', scheduled_date: '2026-09-07', day_order: 1,
    estimated_minutes: 30, status: 'pending',
  }],
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
  it('shows plan scope and emits server regeneration parameters', async () => {
    const wrapper = mount(PlanPreview, { props: { preview } })
    expect(wrapper.text()).toContain(preview.topic)
    expect(wrapper.text()).toContain('1 个')
    await wrapper.get('input[name="daily_minutes"]').setValue('20')
    await wrapper.get('.preview-edit').trigger('submit')
    expect(wrapper.emitted('update')?.[0]?.[0]).toMatchObject({ daily_minutes: 20 })
    await wrapper.get('.tool-actions .primary').trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })
})
