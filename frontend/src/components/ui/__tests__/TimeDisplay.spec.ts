import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TimeDisplay from '../TimeDisplay.vue'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 15, 12))
})
afterEach(() => vi.useRealTimers())

describe('TimeDisplay', () => {
  it.each([
    [new Date(2026, 9, 15, 9, 5, 42).toISOString(), '09:05', '2026-10-15 09:05'],
    [new Date(2026, 8, 7, 9, 5).toISOString(), '09/07', '2026-09-07 09:05'],
    [new Date(2025, 11, 31, 23, 59).toISOString(), '2025/12/31', '2025-12-31 23:59'],
    ['2026-10-15', '10/15', '2026-10-15'],
    ['2026-05', '2026-05', '2026-05'],
    ['invalid', 'invalid', 'invalid'],
    [null, '—', '—'],
  ])(
    'formats %s consistently and keeps full precision available on hover',
    (value, text, title) => {
      const wrapper = mount(TimeDisplay, { props: { value } })
      expect(wrapper.text()).toBe(text)
      expect(wrapper.attributes('title')).toBe(title)
      expect(wrapper.attributes('datetime')).toBe(value ?? undefined)
      wrapper.unmount()
    },
  )
})
