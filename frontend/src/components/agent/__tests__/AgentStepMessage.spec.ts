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
          choices: ['选项 A', '选项 B', '选项 C', '选项 D'],
          current: 2,
          total: 3,
        },
      },
    })
    expect(wrapper.text()).toContain('测试 2/3')
    expect(wrapper.text()).toContain(longPrompt)
    const choices = wrapper.findAll('.step-choices button')
    expect(choices.map((choice) => choice.text())).toEqual([
      'A. 选项 A',
      'B. 选项 B',
      'C. 选项 C',
      'D. 选项 D',
    ])
    expect(wrapper.get('.step-footer button').text()).toBe('放弃测试')
    await choices[1].trigger('click')
    expect(wrapper.emitted('answer')).toEqual([['选项 B']])
  })

  it('shows the assessment abandon button and emits cancel', async () => {
    const wrapper = mount(AgentStepMessage, {
      props: {
        kind: 'assessment',
        step: {
          step_id: 'step-1',
          prompt: '评估问题',
          input_type: 'text',
          choices: [],
          current: 1,
          total: 3,
        },
      },
    })

    const button = wrapper.find('.step-footer button')
    expect(button.text()).toBe('放弃评估')
    await button.trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)

    await wrapper.setProps({ busy: true })
    expect(button.attributes('disabled')).toBeDefined()
  })
})
