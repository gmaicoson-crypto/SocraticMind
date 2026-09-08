import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import * as memoriesApi from '../../../api/memories'
import AgentMemorySection from '../AgentMemorySection.vue'
import ConfirmDialog from '../../ui/ConfirmDialog.vue'
import { useLearningStore } from '../../../stores/learning'
import type { Memory } from '../../../types/learningAgent'

vi.mock('../../../api/memories', () => ({
  createMemory: vi.fn(), deleteMemory: vi.fn(), getMemories: vi.fn(), updateMemory: vi.fn(),
}))

const preference: Memory = {
  id: 1, topic_id: 2, kind: 'preference', content: '先看示例再解释概念', source: 'user',
  confidence: null, created_at: '2026-09-07T00:00:00Z', updated_at: '2026-09-07T00:00:00Z',
}
const weakness: Memory = {
  id: 2, topic_id: null, kind: 'weakness', content: '边界条件容易遗漏', source: 'assessment',
  confidence: 0.8, created_at: '2026-09-07T00:00:00Z', updated_at: '2026-09-07T00:00:00Z',
}

describe('AgentMemorySection', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true, value: vi.fn().mockReturnValue({ matches: false }),
    })
    document.body.innerHTML = ''
    const pinia = createPinia()
    setActivePinia(pinia)
    const learning = useLearningStore()
    learning.topics = [{ id: '2', title: '数据结构', emoji: 'D', nodes: 3, mastered: 1 }]
    vi.clearAllMocks()
    vi.mocked(memoriesApi.getMemories).mockResolvedValue([preference, weakness])
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('groups memories and shows their source and scope', async () => {
    const wrapper = mount(AgentMemorySection)
    await flushPromises()

    expect(wrapper.findAll('.memory-group')).toHaveLength(5)
    expect(wrapper.text()).toContain('先看示例再解释概念')
    expect(wrapper.text()).toContain('用户提供')
    expect(wrapper.text()).toContain('数据结构')
    expect(wrapper.text()).toContain('评估生成')
    expect(wrapper.text()).toContain('全部主题')
  })

  it('creates and edits memory through the shared editor modal', async () => {
    vi.mocked(memoriesApi.createMemory).mockResolvedValue({
      ...preference, id: 3, topic_id: null, kind: 'goal', content: '完成项目',
    })
    vi.mocked(memoriesApi.updateMemory).mockResolvedValue({ ...preference, content: '优先看代码' })
    const wrapper = mount(AgentMemorySection, { attachTo: document.body })
    await flushPromises()

    await wrapper.get('.add-button').trigger('click')
    await setEditorContent('完成项目')
    clickDialogButton('保存')
    await flushPromises()
    expect(memoriesApi.createMemory).toHaveBeenCalledWith({
      kind: 'goal', topic_id: null, content: '完成项目',
    })
    expect(wrapper.text()).toContain('完成项目')

    await wrapper.findAll('.memory-actions button')[0].trigger('click')
    await setEditorContent('优先看代码')
    clickDialogButton('保存')
    await flushPromises()
    expect(memoriesApi.updateMemory).toHaveBeenCalledWith(3, expect.objectContaining({ content: '优先看代码' }))
  })

  it('deletes only after confirmation', async () => {
    vi.mocked(memoriesApi.deleteMemory).mockResolvedValue(undefined)
    const wrapper = mount(AgentMemorySection)
    await flushPromises()
    const deleteButton = wrapper.findAll('.memory-actions button').find(button => button.attributes('title') === '删除记忆')
    await deleteButton!.trigger('click')

    await wrapper.findComponent(ConfirmDialog).vm.$emit('confirm')
    await flushPromises()

    expect(memoriesApi.deleteMemory).toHaveBeenCalledWith(1)
    expect(wrapper.text()).not.toContain('先看示例再解释概念')
  })
})

async function setEditorContent(value: string) {
  const input = document.querySelector<HTMLInputElement>('input[name="content"]')
  if (!input) throw new Error('memory content input not found')
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}

function clickDialogButton(label: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>('.memory-dialog button')]
    .find(candidate => candidate.textContent?.trim() === label)
  if (!button) throw new Error(`${label} button not found`)
  button.click()
}
