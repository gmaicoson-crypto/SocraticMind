import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import OnboardingForm from '../OnboardingForm.vue'

describe('OnboardingForm', () => {
  it('collects every required planning field and locks while busy', async () => {
    const wrapper = mount(OnboardingForm, {
      props: { topic: 'Rust', sessionId: 'session-7', defaultTimezone: 'UTC' },
    })
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
