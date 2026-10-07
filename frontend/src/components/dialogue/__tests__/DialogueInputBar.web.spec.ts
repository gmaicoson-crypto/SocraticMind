import { shallowMount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DialogueInputBar from '../DialogueInputBar.vue'

describe('backend managed networking', () => {
  it.each(['normal', 'socratic'] as const)(
    'keeps the %s input free of networking controls and configuration hints',
    async (chatMode) => {
      const wrapper = shallowMount(DialogueInputBar, {
        props: {
          input: '',
          chatMode,
          aiStyle: '标准',
          aiStyleOptions: ['标准'],
          chips: [],
          chipsLoading: false,
          quotedText: '',
          isThinking: false,
          isGenerating: false,
          socraticBadge: 0,
          normalBadge: 0,
          placeholder: '输入',
        },
      })
      expect(wrapper.find('[aria-label="联网模式"]').exists()).toBe(false)
      expect(wrapper.find('.web-control').exists()).toBe(false)
      expect(wrapper.find('.web-hint').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('联网')
      await wrapper.setProps({ isThinking: true, isGenerating: true })
      expect(wrapper.text()).not.toContain('联网')
      expect(wrapper.get('button[title="中断回答"]').text()).toBe('中断')
      wrapper.unmount()
    },
  )
})
