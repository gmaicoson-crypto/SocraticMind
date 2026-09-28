import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useResizablePane } from '../useResizablePane'

const Harness = defineComponent({
  setup() {
    const containerRef = ref<HTMLElement | null>(null)
    const pane = useResizablePane(containerRef)
    return { ...pane, containerRef }
  },
  template: '<main ref="containerRef" />',
})

describe('useResizablePane', () => {
  let containerWidth = 1400
  let originalClientWidth: PropertyDescriptor | undefined

  beforeEach(() => {
    originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => containerWidth,
    })
  })

  afterEach(() => {
    if (originalClientWidth) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth)
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth')
    }
  })

  it('clamps both drag directions to the panel minimums', () => {
    const wrapper = mount(Harness)
    const pane = wrapper.vm as unknown as {
      leftWidth: number
      startDrag: (event: MouseEvent) => void
    }

    pane.startDrag(new MouseEvent('mousedown', { clientX: 0 }))
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 5000 }))
    expect(pane.leftWidth).toBe(842)
    window.dispatchEvent(new MouseEvent('mouseup'))

    pane.startDrag(new MouseEvent('mousedown', { clientX: 0 }))
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: -5000 }))
    expect(pane.leftWidth).toBe(480)
    window.dispatchEvent(new MouseEvent('mouseup'))

    wrapper.unmount()
  })

  it('keeps the divider inside a temporarily narrow container', () => {
    containerWidth = 900
    const wrapper = mount(Harness)
    const pane = wrapper.vm as unknown as {
      leftWidth: number
      startDrag: (event: MouseEvent) => void
    }

    pane.startDrag(new MouseEvent('mousedown', { clientX: 0 }))
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 0 }))
    expect(pane.leftWidth).toBe(414)
    window.dispatchEvent(new MouseEvent('mouseup'))
    wrapper.unmount()
  })
})
