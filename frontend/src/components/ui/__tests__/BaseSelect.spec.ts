import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import BaseSelect from '../BaseSelect.vue'

const options = [
  { value: 'new', label: '全新接触' },
  { value: 'beginner', label: '入门' },
  { value: 'intermediate', label: '有基础' },
]
let unmount: (() => void) | undefined

function mountSelect() {
  const wrapper = mount(BaseSelect, {
    attachTo: document.body,
    props: { modelValue: 'beginner', label: '当前熟悉度', options },
  })
  unmount = () => wrapper.unmount()
  return { wrapper, trigger: wrapper.get('[role="combobox"]') }
}

function panel() {
  return document.body.querySelector('[role="listbox"]')
}

describe('BaseSelect', () => {
  afterEach(() => {
    unmount?.()
    unmount = undefined
  })

  it('opens on click, highlights the current value, and closes on outside interaction', async () => {
    const { wrapper, trigger } = mountSelect()
    await trigger.trigger('pointerenter')
    expect(panel()).toBeNull()
    await trigger.trigger('click')
    expect(trigger.attributes('aria-expanded')).toBe('true')
    expect(panel()?.querySelector('[aria-selected="true"]')?.textContent).toBe('入门')

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(panel()).toBeNull()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('supports arrow keys, selection, and closing with Escape while retaining focus', async () => {
    const { wrapper, trigger } = mountSelect()
    await trigger.trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(trigger.element)
    expect(panel()?.querySelector('.is-active')?.textContent).toBe('入门')
    await trigger.trigger('keydown', { key: 'End' })
    expect(panel()?.querySelector('.is-active')?.textContent).toBe('有基础')
    await trigger.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('update:modelValue')).toEqual([['intermediate']])
    expect(panel()).toBeNull()

    await trigger.trigger('click')
    await trigger.trigger('keydown', { key: 'Escape' })
    expect(panel()).toBeNull()
    expect(document.activeElement).toBe(trigger.element)
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
  })
})
