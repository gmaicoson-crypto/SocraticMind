import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import Home from '../Home.vue'
import { useLearningStore } from '../../stores/learning'

vi.mock('../../composables/useStudyTimer', () => ({ useStudyTimer: vi.fn() }))

describe('Home plan tab', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    })
  })

  it('opens the learning plan tab', async () => {
    const wrapper = mount(Home, {
      global: {
        plugins: [createPinia()],
        stubs: {
          TopBar: true,
          Sidebar: true,
          SocraticDialogue: true,
          KnowledgeGraph: true,
          NotesPanel: true,
          TodayPlanPanel: { template: '<div data-test="today-plan" />' },
        },
      },
    })
    const tab = wrapper
      .findAll('.right-tab')
      .find((candidate) => candidate.text().includes('学习计划'))
    expect(tab).toBeTruthy()
    await tab!.trigger('click')
    expect(tab!.classes()).toContain('active')
  })

  it('switches between dialogue and the shared workspace on narrow screens', async () => {
    const pinia = createPinia()
    const learning = useLearningStore(pinia)
    learning.recommendations = [{ title: 'Rust', emoji: 'R', reason: 'Systems' }]
    const wrapper = mount(Home, {
      global: {
        plugins: [pinia],
        stubs: {
          TopBar: true,
          SocraticDialogue: true,
          KnowledgeGraph: true,
          NotesPanel: true,
          TodayPlanPanel: true,
        },
      },
    })

    expect(wrapper.find('.right-col').classes()).toContain('mobile-hidden')
    await wrapper.findAll('.mobile-pane-tabs button')[1].trigger('click')
    expect(wrapper.find('.dialogue-col').classes()).toContain('mobile-hidden')
    expect(wrapper.find('.right-col').classes()).not.toContain('mobile-hidden')
    await wrapper.get('.recommend-row').trigger('click')
    expect(wrapper.find('.dialogue-col').classes()).not.toContain('mobile-hidden')
    expect(wrapper.find('.right-col').classes()).toContain('mobile-hidden')
    wrapper.unmount()
  })
})
