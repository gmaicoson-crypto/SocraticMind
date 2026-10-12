import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { DialogueSession } from '../../../types'
import { createDefaultSession } from '../../../composables/useChatSessions'
import DialogueHistoryPanel from '../DialogueHistoryPanel.vue'

function mountHistory(sessions: DialogueSession[]) {
  return mount(DialogueHistoryPanel, {
    props: {
      show: true,
      chatMode: 'socratic',
      sessions,
      fallbackAvatarUrl: '',
      currentSessionId: sessions[0].id,
      editingSessionId: null,
      editingName: '',
    },
  })
}

describe('dialogue history presentation', () => {
  it('displays AI titles and counts actual messages with or without a welcome message', () => {
    const normal = createDefaultSession('socratic')
    normal.name = '工具调用与普通文本回答的区别'
    normal.messages.push(
      { role: 'user', text: '我的问题', time: '' },
      { role: 'ai', text: '回答', time: '' },
    )
    const restored = createDefaultSession('socratic')
    restored.messages = [{ role: 'user', text: '历史问题', time: '' }]
    const empty = createDefaultSession('socratic')
    empty.messages = []
    const wrapper = mountHistory([normal, restored, empty])
    expect(wrapper.findAll('.history-count').map((item) => item.text())).toEqual([
      '2 条',
      '1 条',
      '0 条',
    ])
    expect(wrapper.get('.history-name').text()).toBe(normal.name)
    expect(wrapper.get('.history-name').attributes('title')).toBe(normal.name)
    const counts = wrapper.findAll('.history-count')
    expect(
      counts.every((count) => count.element.parentElement?.classList.contains('history-item')),
    ).toBe(true)
    wrapper.unmount()
  })

  it('keeps rename and delete actions usable alongside the separate count column', async () => {
    const session = createDefaultSession('normal')
    session.messages.push({ role: 'user', text: '问题', time: '' })
    const wrapper = mountHistory([session])
    await wrapper.get('[title="重命名"]').trigger('click')
    expect(wrapper.emitted('startEdit')?.[0]).toEqual([session])
    await wrapper.setProps({ editingSessionId: session.id, editingName: '新的概括' })
    await wrapper.get('.history-name-input').trigger('keydown.enter')
    expect(wrapper.emitted('saveName')?.[0]).toEqual([session.id])
    await wrapper.setProps({ editingSessionId: null })
    await wrapper.get('[title="删除"]').trigger('click')
    expect(wrapper.emitted('delete')?.[0]).toEqual([session.id])
    expect(wrapper.get('.history-count').text()).toBe('1 条')
    wrapper.unmount()
  })

  it('shows the date above the minute time without ISO separators or seconds', () => {
    const session = createDefaultSession('normal')
    session.updatedAt = new Date(2026, 9, 12, 5, 13, 47).toISOString()
    const wrapper = mountHistory([session])
    expect(wrapper.get('.history-date').text()).toBe('2026-10-12')
    expect(wrapper.get('.history-clock').text()).toBe('05:13')
    expect(wrapper.get('.history-time').text()).not.toContain('T')
    wrapper.unmount()
  })
})
