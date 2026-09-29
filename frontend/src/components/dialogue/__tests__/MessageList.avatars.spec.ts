import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MessageList from '../MessageList.vue'
import { aiAvatarPresets, userAvatarPresets } from '../../../utils/avatarPresets'

describe('MessageList avatars', () => {
  it('updates rendered message portraits when the profile changes', async () => {
    const wrapper = mount(MessageList, {
      props: {
        messages: [
          { role: 'ai', text: '你好', time: '10:00' },
          { role: 'user', text: '你好', time: '10:01' },
        ],
        streamingText: '',
        isThinking: false,
        avatarUrl: userAvatarPresets[0],
        aiAvatarUrl: aiAvatarPresets[0],
      },
    })

    await wrapper.setProps({
      avatarUrl: userAvatarPresets[1],
      aiAvatarUrl: aiAvatarPresets[1],
    })

    expect(wrapper.find('.msg-row.ai .ai-avatar-image').attributes('src')).toBe(aiAvatarPresets[1])
    expect(wrapper.find('.msg-row.user .user-avatar-img').attributes('src')).toBe(
      userAvatarPresets[1],
    )

    await wrapper.get('.msg-row.ai .ai-avatar').trigger('click')
    expect(wrapper.emitted('change-ai-avatar')).toHaveLength(1)
  })
})
