import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { changePassword } from '../../../api/auth'
import ProfilePasswordSection from '../ProfilePasswordSection.vue'

vi.mock('../../../api/auth', () => ({ changePassword: vi.fn() }))
afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('profile password section', () => {
  it('rejects mismatched passwords before making a request', async () => {
    const wrapper = mount(ProfilePasswordSection)
    await wrapper.get('.danger-btn').trigger('click')
    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('old-password')
    await inputs[1].setValue('new-password')
    await inputs[2].setValue('different-password')
    await wrapper.get('.save-btn').trigger('click')
    expect(changePassword).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('两次输入的新密码不一致')
    wrapper.unmount()
  })

  it('clears secrets after success and releases the close timer on unmount', async () => {
    vi.useFakeTimers()
    vi.mocked(changePassword).mockResolvedValue(undefined)
    const wrapper = mount(ProfilePasswordSection)
    await wrapper.get('.danger-btn').trigger('click')
    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('old-password')
    await inputs[1].setValue('new-password')
    await inputs[2].setValue('new-password')
    await wrapper.get('.save-btn').trigger('click')
    await flushPromises()
    expect(changePassword).toHaveBeenCalledWith('old-password', 'new-password')
    expect(wrapper.text()).toContain('密码修改成功')
    expect(inputs.every((input) => (input.element as HTMLInputElement).value === '')).toBe(true)
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
