import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AgentStepMessage from '../AgentStepMessage.vue'

describe('AgentStepMessage', () => {
  it('renders progress and emits structured choices without parsing text', async () => {
    const longPrompt = '请说明边界条件'.repeat(30)
    const wrapper = mount(AgentStepMessage, {
      props: {
        step: {
          step_id: 'step-2',
          prompt: longPrompt,
          input_type: 'choice',
          choices: ['选项 A', '选项 B'],
          current: 2,
          total: 3,
        },
      },
    })
    expect(wrapper.text()).toContain('诊断 2/3')
    expect(wrapper.text()).toContain(longPrompt)
    await wrapper.findAll('.step-choices button')[1].trigger('click')
    expect(wrapper.emitted('answer')).toEqual([['选项 B']])
  })
})
