import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import Home from '../Home.vue'

vi.mock('../../composables/useStudyTimer', () => ({ useStudyTimer: vi.fn() }))

describe('Home plan tab', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    })
  })

  it('shows the third right-side panel tab', async () => {
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
    const tab = wrapper.findAll('.right-tab').find(candidate => candidate.text().includes('今日计划'))
    expect(tab).toBeTruthy()
    await tab!.trigger('click')
    expect(tab!.classes()).toContain('active')
  })
})
