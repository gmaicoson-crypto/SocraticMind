import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BaseToast from '../BaseToast.vue'

describe('BaseToast lifecycle', () => {
  afterEach(() => vi.useRealTimers())

  it('restarts dismissal for a new error and clears its timer on unmount', async () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    const wrapper = mount(BaseToast, {
      props: { message: '网络中断', 'onUpdate:message': onDismiss },
      global: { stubs: { teleport: true } },
    })
    expect(wrapper.get('[role="alert"]').text()).toBe('网络中断')
    await vi.advanceTimersByTimeAsync(3000)
    await wrapper.setProps({ message: '模型暂时不可用' })
    await vi.advanceTimersByTimeAsync(1000)
    expect(wrapper.emitted('update:message')).toBeUndefined()
    await vi.advanceTimersByTimeAsync(3000)
    expect(wrapper.emitted('update:message')).toEqual([['']])
    await wrapper.setProps({ message: '' })
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    await wrapper.setProps({ message: '另一条错误' })
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(4000)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
