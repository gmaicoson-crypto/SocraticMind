import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import AvatarPresetPicker from '../AvatarPresetPicker.vue'
import { avatarSrc } from '../../../utils/avatar'
import { aiAvatarPresets, userAvatarPresets } from '../../../utils/avatarPresets'

describe('AvatarPresetPicker', () => {
  it('shows every supplied portrait and emits the selected path', async () => {
    const wrapper = mount(AvatarPresetPicker, {
      props: { label: '用户头像', options: userAvatarPresets, modelValue: null },
    })

    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(20)
    expect(buttons[0].find('img').attributes('src')).toBe(userAvatarPresets[0])
    await buttons[11].trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual([userAvatarPresets[11]])
  })

  it('marks the AI portrait selection for assistive technology', () => {
    const wrapper = mount(AvatarPresetPicker, {
      props: {
        label: 'AI 头像',
        options: aiAvatarPresets,
        modelValue: aiAvatarPresets[2],
      },
    })

    expect(wrapper.findAll('button')).toHaveLength(6)
    expect(wrapper.findAll('button')[2].attributes('aria-pressed')).toBe('true')
  })

  it('serves presets from the frontend even with a separate API host', () => {
    vi.stubEnv('VITE_API_BASE', 'https://api.example.test')
    try {
      expect(avatarSrc(userAvatarPresets[0])).toBe(userAvatarPresets[0])
      expect(avatarSrc('/static/avatars/upload.webp')).toBe(
        'https://api.example.test/static/avatars/upload.webp',
      )
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
