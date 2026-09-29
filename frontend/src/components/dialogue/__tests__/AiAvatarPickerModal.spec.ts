import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import AiAvatarPickerModal from '../AiAvatarPickerModal.vue'
import { normalAiAvatarPresets, studyAiAvatarPresets } from '../../../utils/avatarPresets'

describe('AiAvatarPickerModal', () => {
  it('offers six study presets and emits an uploaded file', async () => {
    const wrapper = mount(AiAvatarPickerModal, {
      props: { mode: 'socratic', currentUrl: studyAiAvatarPresets[0], busy: false, error: '' },
      global: { stubs: { BaseModal: { template: '<div><slot /></div>' } } },
    })

    expect(wrapper.findAll('.preset-option')).toHaveLength(6)
    await wrapper.get('[aria-label="AI 头像 2"]').trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual([studyAiAvatarPresets[1]])

    const file = new File(['image'], 'my-avatar.webp', { type: 'image/webp' })
    const input = wrapper.get('input[type="file"]')
    const click = vi.spyOn(input.element as HTMLInputElement, 'click')
    await wrapper.get('.upload-button').trigger('click')
    expect(click).toHaveBeenCalledOnce()
    Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
    await input.trigger('change')
    expect(wrapper.emitted('upload')?.[0]).toEqual([file])
  })

  it('offers only the normal portraits for ordinary conversations', async () => {
    const wrapper = mount(AiAvatarPickerModal, {
      props: { mode: 'normal', currentUrl: normalAiAvatarPresets[0], busy: false, error: '' },
      global: { stubs: { BaseModal: { template: '<div><slot /></div>' } } },
    })

    expect(wrapper.findAll('.preset-option')).toHaveLength(6)
    expect(wrapper.findAll('.preset-option img').map((image) => image.attributes('src'))).toEqual(
      normalAiAvatarPresets,
    )
    await wrapper.get('[aria-label="AI 头像 2"]').trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual([normalAiAvatarPresets[1]])
  })
})
