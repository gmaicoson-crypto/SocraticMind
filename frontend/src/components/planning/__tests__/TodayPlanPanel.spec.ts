import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TodayPlanPanel from '../../TodayPlanPanel.vue'
import { useAgentStore } from '../../../stores/agent'
import { useLearningStore } from '../../../stores/learning'
import { usePlansStore } from '../../../stores/plans'
import type { TodayPlan, TodayPlanItem } from '../../../types/learningAgent'

vi.mock('../../../api/plans', () => ({
  getTodayPlan: vi.fn().mockResolvedValue({
    date: '2026-09-07', effective_timezone: 'UTC', replan_suggested: false,
    today: [], overdue: [], upcoming: [],
  }),
  getTopicPlan: vi.fn(),
  replanStudyPlan: vi.fn(),
}))

const task = (overrides: Partial<TodayPlanItem> = {}): TodayPlanItem => ({
  plan_id: 4, topic_id: 2, topic_title: '数据结构', topic_emoji: 'D',
  node_id: 20, node_key: 'arrays', node_label: '数组', scheduled_date: '2026-09-07',
  estimated_minutes: 20, status: 'pending', item_ids: [1], day_order: 1,
  ...overrides,
})

function groupedPlan(): TodayPlan {
  return {
    date: '2026-09-07', effective_timezone: 'UTC', replan_suggested: true,
    overdue: [task({ scheduled_date: '2026-09-06' })],
    today: [task()],
    upcoming: [task({ node_id: 21, node_label: '链表', scheduled_date: '2026-09-08' })],
  }
}

describe('TodayPlanPanel', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    })
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders three groups and exposes one overdue replan action', async () => {
    const plans = usePlansStore()
    plans.todayPlan = groupedPlan()
    vi.spyOn(plans, 'fetchToday').mockResolvedValue(plans.todayPlan)
    const replan = vi.spyOn(plans, 'replanOverdue').mockResolvedValue(plans.todayPlan)

    const wrapper = mount(TodayPlanPanel)
    expect(wrapper.text()).toContain('过期')
    expect(wrapper.text()).toContain('今日')
    expect(wrapper.text()).toContain('后续')
    const button = wrapper.findAll('button').find(candidate => candidate.text().includes('重新规划'))
    expect(button).toBeTruthy()
    await button!.trigger('click')
    expect(replan).toHaveBeenCalledWith([4], 'UTC')
  })

  it('waits for topic nodes before selecting the task node', async () => {
    const plans = usePlansStore()
    plans.todayPlan = { ...groupedPlan(), overdue: [], upcoming: [] }
    vi.spyOn(plans, 'fetchToday').mockResolvedValue(plans.todayPlan)
    const learning = useLearningStore()
    const select = vi.spyOn(learning, 'setActiveNode')
    vi.spyOn(learning, 'setActiveTopic').mockImplementation(async () => {
      learning.nodes = [{ id: 'arrays', label: '数组', sub: '', x: 0, y: 0, state: 'available', dbId: 20 }]
    })

    const wrapper = mount(TodayPlanPanel)
    await wrapper.get('.task-row').trigger('click')
    await flushPromises()

    expect(learning.setActiveTopic).toHaveBeenCalledWith('2')
    expect(select).toHaveBeenCalledWith(expect.objectContaining({ dbId: 20 }))
    expect(wrapper.emitted('navigated')).toHaveLength(1)
  })

  it('starts an existing-topic plan draft from the empty state', async () => {
    const plans = usePlansStore()
    plans.todayPlan = {
      date: '2026-09-07', effective_timezone: 'UTC', replan_suggested: false,
      today: [], overdue: [], upcoming: [],
    }
    vi.spyOn(plans, 'fetchToday').mockResolvedValue(plans.todayPlan)
    const learning = useLearningStore()
    learning.topics = [{ id: '2', title: '数据结构', emoji: 'D', nodes: 3, mastered: 0 }]
    learning.activeTopicId = '2'

    const wrapper = mount(TodayPlanPanel)
    await wrapper.get('.primary-action').trigger('click')

    expect(useAgentStore().topicPlanDraft).toEqual({ topicId: 2, title: '数据结构' })
  })
})
