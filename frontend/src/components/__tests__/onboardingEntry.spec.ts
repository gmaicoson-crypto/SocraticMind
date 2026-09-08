import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import Sidebar from '../Sidebar.vue'
import SocraticDialogue from '../SocraticDialogue.vue'
import { useAgentStore } from '../../stores/agent'
import { useLearningStore } from '../../stores/learning'

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
})
