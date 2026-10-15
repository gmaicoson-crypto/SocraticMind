import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import AssessmentResultModal from '../AssessmentResultModal.vue'
import type { AssessmentResult } from '../../../types/learningAgent'

const result: AssessmentResult = {
  node_id: 20,
  node_label: '数组',
  scores: [{ question_id: 'q1', score: 3, rationale: '概念正确但例子不足' }],
  total_score: 8,
  evaluation_confidence: 0.82,
  critical_misconception: false,
  evidence: '基础概念清楚',
  weaknesses: ['边界条件'],
  passed: false,
  professional_review_required: false,
  threshold: {
    minimum_score: 9,
    minimum_confidence: 0.7,
    requires_no_critical_misconception: true,
  },
  next_actions: ['continue_learning', 'retry_assessment'],
}
const wrappers: ReturnType<typeof mount>[] = []
const hosts: HTMLElement[] = []

function mountResult(passed = false) {
  const host = document.createElement('div')
  document.body.append(host)
  hosts.push(host)
  const wrapper = mount(AssessmentResultModal, {
    props: { result: { ...result, passed } },
    attachTo: host,
  })
  wrappers.push(wrapper)
  const dialog = document.querySelector<HTMLElement>('.assessment-result-dialog')!
  return {
    wrapper,
    host,
    dialog,
    overlay: document.querySelector<HTMLElement>('.assessment-result-overlay')!,
  }
}

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  hosts.splice(0).forEach((host) => host.remove())
})

describe('AssessmentResultModal', () => {
  it.each(['close', 'backdrop', 'escape', 'continue'] as const)(
    'shows the result outside its host and dismisses it through %s',
    async (action) => {
      const { wrapper, host, dialog, overlay } = mountResult()
      expect(host.contains(dialog)).toBe(false)
      expect(dialog.getAttribute('aria-modal')).toBe('true')
      expect(dialog.textContent).toContain('67/100')
      if (action === 'close') dialog.querySelector<HTMLButtonElement>('.result-close')!.click()
      if (action === 'backdrop') overlay.click()
      if (action === 'escape')
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      if (action === 'continue') {
        const button = [...dialog.querySelectorAll('button')].find(
          (item) => item.textContent === '继续学习',
        )!
        button.click()
      }
      await flushPromises()
      expect(wrapper.emitted('continue')).toEqual([[]])
      expect(result.scores).toHaveLength(1)
    },
  )

  it.each([false, true])('preserves the result actions for passed=%s', async (passed) => {
    const { wrapper, dialog } = mountResult(passed)
    const button = [...dialog.querySelectorAll('button')].find(
      (item) => item.textContent === (passed ? '撤销掌握' : '重新评估'),
    )!
    button.click()
    await flushPromises()
    expect(wrapper.emitted(passed ? 'revert' : 'retry')).toEqual([[]])
    expect(wrapper.emitted('continue')).toBeUndefined()
  })

  it('prevents dismissal during an operation or while a child confirmation is open', async () => {
    const { wrapper, dialog, overlay } = mountResult()
    await wrapper.setProps({ busy: true })
    dialog.querySelector<HTMLButtonElement>('.result-close')!.click()
    overlay.click()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(wrapper.emitted('continue')).toBeUndefined()
    expect([...dialog.querySelectorAll('button')].every((button) => button.disabled)).toBe(true)
    await wrapper.setProps({ busy: false, closeDisabled: true })
    overlay.click()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(wrapper.emitted('continue')).toBeUndefined()
  })

  it('switches between two pages inside the same centered dialog and keeps actions available', async () => {
    const { wrapper, dialog } = mountResult()
    const pages = dialog.querySelectorAll<HTMLButtonElement>('.result-pages button')
    expect(dialog.querySelector('.score-list')).toBeNull()
    pages[1]!.click()
    await flushPromises()
    expect(document.querySelector('.assessment-result-dialog')).toBe(dialog)
    expect(dialog.querySelector('.score-list')?.textContent).toContain('概念正确但例子不足')
    const proceed = [...dialog.querySelectorAll('button')].find(
      (button) => button.textContent === '继续学习',
    )!
    proceed.click()
    await flushPromises()
    expect(wrapper.emitted('continue')).toEqual([[]])
    pages[0]!.click()
    await flushPromises()
    expect(dialog.querySelector('.evidence')?.textContent).toBe('基础概念清楚')
    expect(dialog.querySelector('.score-list')).toBeNull()
  })

  it('keeps keyboard focus inside the result and restores the previous control on unmount', async () => {
    const previous = document.createElement('button')
    document.body.append(previous)
    hosts.push(previous)
    previous.focus()
    const { wrapper, dialog } = mountResult()
    await flushPromises()
    expect(document.activeElement).toBe(dialog)
    const buttons = dialog.querySelectorAll<HTMLButtonElement>('button')
    const first = buttons[0]!
    const last = buttons[buttons.length - 1]!
    dialog.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    )
    expect(document.activeElement).toBe(first)
    first.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }),
    )
    expect(document.activeElement).toBe(last)
    last.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    )
    expect(document.activeElement).toBe(first)
    wrappers.splice(wrappers.indexOf(wrapper), 1)
    wrapper.unmount()
    expect(document.activeElement).toBe(previous)
  })

  it('closes the grading guide on Escape while keeping the assessment result open', async () => {
    const { wrapper, dialog } = mountResult()
    const trigger = dialog.querySelector<HTMLButtonElement>('[aria-label="查看评分标准细则"]')!
    trigger.click()
    await flushPromises()
    const guide = dialog.querySelector<HTMLElement>('.scoring-guide-panel')!
    expect(document.activeElement).toBe(guide)
    guide.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    )
    await flushPromises()
    expect(dialog.querySelector('.scoring-guide-panel')).toBeNull()
    expect(wrapper.emitted('continue')).toBeUndefined()
    expect(document.activeElement).toBe(trigger)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('continue')).toEqual([[]])
  })
})
