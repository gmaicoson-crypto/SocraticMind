import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import AssessmentHistoryModal from '../AssessmentHistoryModal.vue'
import { getAgentRun, getNodeAssessmentHistory } from '../../../api/agent'
import type {
  AgentRun,
  AssessmentHistoryItem,
  AssessmentHistoryPage,
  AssessmentResult,
} from '../../../types/learningAgent'

vi.mock('../../../api/agent', () => ({ getAgentRun: vi.fn(), getNodeAssessmentHistory: vi.fn() }))

const records: AssessmentHistoryItem[] = Array.from({ length: 41 }, (_, index) => 41 - index).map(
  (id) => ({
    id,
    run_id: `run-${id}`,
    assessed_at: new Date(Date.UTC(2026, 9, 15, 10, id)).toISOString(),
    total_score: id === 1 ? 9 : 80,
    max_score: id === 1 ? 12 : 100,
    passed: id !== 2,
  }),
)
function historyPage(page = 1, history = records): AssessmentHistoryPage {
  const totalPages = Math.ceil(history.length / 20)
  const currentPage = Math.min(page, Math.max(totalPages, 1))
  return {
    items: history.slice((currentPage - 1) * 20, currentPage * 20),
    page: currentPage,
    page_size: 20,
    total: history.length,
    total_pages: totalPages,
  }
}
const result: AssessmentResult = {
  node_id: 20,
  node_label: '数组',
  total_score: 80,
  max_score: 100,
  passed: true,
  evidence: '上次评估的结论',
  weaknesses: [],
  professional_review_required: false,
  threshold: { minimum_score: 75 },
  next_actions: [],
  scores: [
    {
      question_id: 'q1',
      score: 80,
      max_score: 100,
      rationale: '需要说明边界条件',
      question: '历史原题',
      answer: '上次提交的答案',
    },
  ],
}
function completedRun(value: AssessmentResult = result): AgentRun {
  return {
    run_id: 'run-1',
    type: 'assessment',
    status: 'completed',
    version: 4,
    step: null,
    preview: null,
    error: null,
    result: value,
  }
}
const wrappers: ReturnType<typeof mount>[] = []
async function mountHistory() {
  const wrapper = mount(AssessmentHistoryModal, { props: { nodeId: 20, nodeLabel: '数组' } })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}
function dialog() {
  return document.querySelector<HTMLElement>('.assessment-result-dialog')!
}
function click(selector: string) {
  dialog().querySelector<HTMLButtonElement>(selector)!.click()
  return flushPromises()
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getNodeAssessmentHistory).mockImplementation(async (_nodeId, page = 1) =>
    historyPage(page),
  )
  vi.mocked(getAgentRun).mockResolvedValue(completedRun())
})
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('AssessmentHistoryModal', () => {
  it('navigates by page number, previous and next while preserving the page after viewing details', async () => {
    const wrapper = await mountHistory()
    expect(getNodeAssessmentHistory).toHaveBeenCalledWith(20, 1)
    expect(dialog().querySelectorAll('.history-record')).toHaveLength(20)
    expect(dialog().querySelector('.history-page-summary')?.textContent?.trim()).toBe(
      '共 41 条记录，共 3 页',
    )
    expect(dialog().querySelector<HTMLButtonElement>('.history-previous')!.disabled).toBe(true)
    expect(dialog().querySelector<HTMLButtonElement>('.history-next')!.disabled).toBe(false)
    expect(getAgentRun).not.toHaveBeenCalled()
    await click('.history-next')
    expect(getNodeAssessmentHistory).toHaveBeenLastCalledWith(20, 2)
    expect(dialog().querySelectorAll('.history-record')).toHaveLength(20)
    expect(dialog().querySelector('[data-assessment-id="41"]')).toBeNull()
    expect(dialog().querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('2')
    await click('[data-page="3"]')
    expect(getNodeAssessmentHistory).toHaveBeenLastCalledWith(20, 3)
    expect(dialog().querySelectorAll('.history-record')).toHaveLength(1)
    expect(dialog().querySelector<HTMLButtonElement>('.history-next')!.disabled).toBe(true)
    expect(dialog().querySelector('[data-assessment-id="1"]')?.textContent).toContain('75/100')
    await click('[data-assessment-id="1"]')
    expect(getAgentRun).toHaveBeenCalledWith('run-1')
    expect(dialog().textContent).toContain(result.evidence)
    expect(dialog().textContent).not.toContain('撤销掌握')
    expect(dialog().textContent).not.toContain('重新评估')
    expect(document.activeElement).toBe(dialog().querySelector('.history-back'))
    dialog().querySelectorAll<HTMLButtonElement>('.result-pages button')[1]!.click()
    await flushPromises()
    expect(dialog().textContent).toContain('历史原题')
    expect(dialog().textContent).toContain('上次提交的答案')
    await click('.history-back')
    expect(dialog().querySelectorAll('.history-record')).toHaveLength(1)
    expect(dialog().querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('3')
    expect(getNodeAssessmentHistory).toHaveBeenCalledTimes(3)
    expect(document.activeElement).toBe(dialog().querySelector('[data-assessment-id="1"]'))
    expect(wrapper.emitted('close')).toBeUndefined()
    await click('.history-previous')
    expect(getNodeAssessmentHistory).toHaveBeenLastCalledWith(20, 2)
    expect(dialog().querySelectorAll('.history-record')).toHaveLength(20)
    await click('[data-page="1"]')
    expect(getNodeAssessmentHistory).toHaveBeenLastCalledWith(20, 1)
    expect(dialog().querySelector('[data-assessment-id="41"]')).not.toBeNull()
  })

  it('allows retrying initial and subsequent page failures without losing loaded records', async () => {
    vi.mocked(getNodeAssessmentHistory).mockRejectedValueOnce(new Error('历史记录加载失败'))
    await mountHistory()
    expect(dialog().querySelector('[role="alert"]')?.textContent).toContain('历史记录加载失败')
    await click('.history-error button')
    expect(dialog().querySelectorAll('.history-record')).toHaveLength(20)
    vi.mocked(getNodeAssessmentHistory).mockRejectedValueOnce(new Error('更早的记录加载失败'))
    await click('.history-next')
    expect(dialog().querySelectorAll('.history-record')).toHaveLength(20)
    expect(dialog().querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('1')
    await click('.history-error button')
    expect(getNodeAssessmentHistory).toHaveBeenLastCalledWith(20, 2)
    expect(dialog().querySelectorAll('.history-record')).toHaveLength(20)
    expect(dialog().querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('2')
    expect(dialog().querySelector('[role="alert"]')).toBeNull()
  })

  it('allows retrying a failed detail request and returning to the same list', async () => {
    await mountHistory()
    vi.mocked(getAgentRun).mockRejectedValueOnce(new Error('详情加载失败'))
    await click('[data-assessment-id="40"]')
    expect(dialog().querySelector('[role="alert"]')?.textContent).toContain('详情加载失败')
    await click('.history-state button')
    expect(getAgentRun).toHaveBeenLastCalledWith('run-40')
    expect(dialog().textContent).toContain(result.evidence)
    await click('.history-back')
    expect(dialog().querySelectorAll('.history-record')).toHaveLength(20)
    expect(getNodeAssessmentHistory).toHaveBeenCalledTimes(1)
  })

  it('blocks duplicate page requests during loading and resets list scrolling on success', async () => {
    let resolvePage!: (page: AssessmentHistoryPage) => void
    await mountHistory()
    const list = dialog().querySelector<HTMLElement>('.history-list-page')!
    list.scrollTop = 300
    vi.mocked(getNodeAssessmentHistory).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePage = resolve
        }),
    )
    await click('.history-next')
    expect(dialog().querySelector('.history-list-page')?.getAttribute('aria-busy')).toBe('true')
    expect(
      [...dialog().querySelectorAll<HTMLButtonElement>('.history-page-controls button')].every(
        (button) => button.disabled,
      ),
    ).toBe(true)
    expect(dialog().querySelector<HTMLButtonElement>('.history-record')!.disabled).toBe(true)
    await click('.history-next')
    expect(getNodeAssessmentHistory).toHaveBeenCalledTimes(2)
    resolvePage(historyPage(2))
    await flushPromises()
    expect(list.scrollTop).toBe(0)
    expect(dialog().querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('2')
    expect(document.activeElement).toBe(dialog().querySelector('[data-page="2"]'))
  })

  it('keeps page controls compact for a large history and supports jumping to the last page', async () => {
    const largeHistory = Array.from({ length: 401 }, (_, index) => ({
      ...records[0]!,
      id: 401 - index,
    }))
    vi.mocked(getNodeAssessmentHistory).mockImplementation(async (_nodeId, page = 1) =>
      historyPage(page, largeHistory),
    )
    await mountHistory()
    expect(dialog().querySelector('.history-page-summary')?.textContent?.trim()).toBe(
      '共 401 条记录，共 21 页',
    )
    expect(dialog().querySelectorAll('.history-page-number').length).toBeLessThanOrEqual(7)
    expect(dialog().querySelector('.history-page-ellipsis')).not.toBeNull()
    await click('[data-page="21"]')
    expect(getNodeAssessmentHistory).toHaveBeenLastCalledWith(20, 21)
    expect(dialog().querySelectorAll('.history-record')).toHaveLength(1)
    expect(dialog().querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('21')
    expect(dialog().querySelector<HTMLButtonElement>('.history-next')!.disabled).toBe(true)
    expect(dialog().querySelectorAll('.history-page-number').length).toBeLessThanOrEqual(7)
  })

  it('uses the server page and updated totals when the requested last page no longer exists', async () => {
    await mountHistory()
    vi.mocked(getNodeAssessmentHistory).mockResolvedValueOnce(historyPage(3, records.slice(0, 25)))
    await click('[data-page="3"]')
    expect(dialog().querySelector('.history-page-summary')?.textContent?.trim()).toBe(
      '共 25 条记录，共 2 页',
    )
    expect(dialog().querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('2')
    expect(dialog().querySelector('[data-page="3"]')).toBeNull()
    expect(dialog().querySelectorAll('.history-record')).toHaveLength(5)
    expect(dialog().querySelector<HTMLButtonElement>('.history-next')!.disabled).toBe(true)
  })

  it('starts from page one when switching nodes after browsing later pages', async () => {
    const wrapper = await mountHistory()
    await click('[data-page="2"]')
    await wrapper.setProps({ nodeId: 21, nodeLabel: '链表' })
    await flushPromises()
    expect(getNodeAssessmentHistory).toHaveBeenLastCalledWith(21, 1)
    expect(dialog().querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('1')
    expect(dialog().querySelector<HTMLButtonElement>('.history-previous')!.disabled).toBe(true)
  })

  it('ignores responses belonging to a previously selected node', async () => {
    let resolveOld!: (page: AssessmentHistoryPage) => void
    vi.mocked(getNodeAssessmentHistory).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve
        }),
    )
    const wrapper = await mountHistory()
    expect(dialog().textContent).toContain('正在加载评估记录')
    vi.mocked(getNodeAssessmentHistory).mockResolvedValueOnce(historyPage(1, []))
    await wrapper.setProps({ nodeId: 21, nodeLabel: '链表' })
    await flushPromises()
    resolveOld(historyPage())
    await flushPromises()
    expect(getNodeAssessmentHistory).toHaveBeenLastCalledWith(21, 1)
    expect(dialog().textContent).toContain('链表')
    expect(dialog().textContent).toContain('暂无已完成的评估记录')
    expect(dialog().querySelector('.history-record')).toBeNull()
    expect(dialog().querySelector('.history-page-summary')?.textContent?.trim()).toBe(
      '共 0 条记录，共 0 页',
    )
    expect(dialog().querySelector<HTMLButtonElement>('.history-previous')!.disabled).toBe(true)
    expect(dialog().querySelector<HTMLButtonElement>('.history-next')!.disabled).toBe(true)
  })

  it('ignores a late detail response after returning to the list', async () => {
    let resolveOld!: (run: AgentRun) => void
    vi.mocked(getAgentRun).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve
        }),
    )
    await mountHistory()
    await click('[data-assessment-id="41"]')
    expect(dialog().textContent).toContain('正在加载评估详情')
    await click('.history-back')
    resolveOld(completedRun())
    await flushPromises()
    expect(dialog().querySelector('.assessment-result')).toBeNull()
    expect(dialog().querySelectorAll('.history-record')).toHaveLength(20)
  })

  it('rejects detail data from another node', async () => {
    vi.mocked(getAgentRun).mockResolvedValueOnce(completedRun({ ...result, node_id: 21 }))
    await mountHistory()
    await click('[data-assessment-id="41"]')
    expect(dialog().querySelector('[role="alert"]')?.textContent).toContain('暂时无法查看')
    expect(dialog().querySelector('.assessment-result')).toBeNull()
  })

  it('shows completed scoring evidence even if the later mastery update failed', async () => {
    vi.mocked(getAgentRun).mockResolvedValueOnce({ ...completedRun(), status: 'failed' })
    await mountHistory()
    await click('[data-assessment-id="41"]')
    expect(dialog().textContent).toContain(result.evidence)
    expect(dialog().querySelector('[role="alert"]')).toBeNull()
    expect(dialog().textContent).not.toContain('撤销掌握')
  })

  it('can close during loading and ignore the pending response after unmount', async () => {
    let resolveOld!: (page: AssessmentHistoryPage) => void
    vi.mocked(getNodeAssessmentHistory).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve
        }),
    )
    const wrapper = await mountHistory()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toEqual([[]])
    wrappers.splice(wrappers.indexOf(wrapper), 1)
    wrapper.unmount()
    resolveOld(historyPage())
    await flushPromises()
    expect(document.querySelector('.assessment-result-dialog')).toBeNull()
  })
})
