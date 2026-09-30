import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import OnboardingForm from '../OnboardingForm.vue'

describe('OnboardingForm', () => {
  it('collects every required planning field and locks while busy', async () => {
    const wrapper = mount(OnboardingForm, {
      props: { topic: 'Rust', sessionId: 'session-7', defaultTimezone: 'UTC' },
    })
    expect(wrapper.text()).toContain('领域范围')
    expect(wrapper.text()).toContain('进行3题测试')
    expect(wrapper.text()).not.toContain('设置目标')
    expect(wrapper.find('input[name="timezone"]').exists()).toBe(false)
    await wrapper.get('input[name="goal"]').setValue('Build a CLI')
    await wrapper.get('input[name="domain"]').setValue('software')
    await wrapper.get('select[name="outcome_type"]').setValue('procedure')
    await wrapper.get('select[name="familiarity"]').setValue('beginner')
    await wrapper.get('input[name="daily_minutes"]').setValue('45')
    await wrapper.get('input[name="target_date"]').setValue('2026-10-01')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({
      topic: 'Rust',
      goal: 'Build a CLI',
      domain: 'software',
      outcome_type: 'procedure',
      familiarity: 'beginner',
      daily_minutes: 45,
      target_date: '2026-10-01',
      timezone: 'UTC',
      use_diagnostic: true,
      session_id: 'session-7',
    })

    await wrapper.setProps({ busy: true })
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
  })
})
