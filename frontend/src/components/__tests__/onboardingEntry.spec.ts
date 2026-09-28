import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import Sidebar from '../Sidebar.vue'
import SocraticDialogue from '../SocraticDialogue.vue'
import { useAgentStore } from '../../stores/agent'
import { useLearningStore } from '../../stores/learning'
import { useUiStore } from '../../stores/ui'

vi.mock('../../api/chat', () => ({
  chatStream: vi.fn(),
  deleteChatSession: vi.fn(),
  deleteMessages: vi.fn(),
  getAllMessages: vi.fn().mockResolvedValue([]),
  getSuggestions: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../api/progress', () => ({
  getStreak: vi.fn().mockResolvedValue({ streak: 0, total_days: 0, recent: [] }),
  recordToday: vi.fn().mockResolvedValue(undefined),
}))

describe('onboarding entry points', () => {
  beforeEach(() => {
    localStorage.clear()
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    })
    setActivePinia(createPinia())
  })

  it('routes recommendations and chat intents to the same onboarding draft', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const learning = useLearningStore()
    const agent = useAgentStore()
    learning.recommendations = [{ title: 'Rust', emoji: 'R', reason: 'Systems' }]

    const sidebar = mount(Sidebar, { global: { plugins: [pinia] } })
    await sidebar.get('.recommend-row').trigger('click')
    expect(agent.onboardingTopic).toBe('Rust')
    sidebar.unmount()

    agent.closeOnboarding()
    const dialogue = mount(SocraticDialogue, { global: { plugins: [pinia] } })
    const textarea = dialogue.get('textarea')
    await textarea.setValue('我想学 Rust')
    await textarea.trigger('keydown.enter')
    await flushPromises()

    expect(agent.onboardingTopic).toBe('Rust')
    dialogue.unmount()
  })

  it('toggles the sidebar and persists the collapsed state', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const ui = useUiStore()
    const sidebar = mount(Sidebar, { global: { plugins: [pinia] } })

    expect(ui.sidebarCollapsed).toBe(false)
    await sidebar.get('.collapse-btn').trigger('click')
    expect(ui.sidebarCollapsed).toBe(true)
    expect(localStorage.getItem('sm_sidebar_collapsed')).toBe('true')
    expect(sidebar.find('.sidebar').classes()).toContain('is-collapsed')

    await sidebar.get('.collapsed-toggle').trigger('click')
    expect(ui.sidebarCollapsed).toBe(false)
    expect(localStorage.getItem('sm_sidebar_collapsed')).toBe('false')
    sidebar.unmount()
  })
})
