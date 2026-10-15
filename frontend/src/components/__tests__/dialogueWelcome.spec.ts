import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { ChatMode, DialogueSession } from '../../types'
import { attachmentCapabilities } from '../../test/fixtures/attachments'
import DialogueInputBar from '../dialogue/DialogueInputBar.vue'
import MessageList from '../dialogue/MessageList.vue'
import SocraticDialogue from '../SocraticDialogue.vue'

vi.mock('../../api/chat', () => ({
  getAllMessages: vi.fn().mockResolvedValue([]),
  getSuggestions: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../api/attachments', () => ({
  getAttachmentCapabilities: vi.fn().mockResolvedValue(attachmentCapabilities),
}))
vi.mock('../../api/models', () => ({
  getLLMModels: vi.fn().mockResolvedValue([]),
}))

async function mountDialogue(mode: ChatMode) {
  const wrapper = shallowMount(SocraticDialogue, {
    global: { stubs: { MessageList: false, DialogueHeader: false } },
  })
  if (mode === 'normal') wrapper.findComponent(DialogueInputBar).vm.$emit('update:chatMode', mode)
  await flushPromises()
  return wrapper
}

function cachedCurrentSession(mode: ChatMode): DialogueSession {
  const sessions = JSON.parse(localStorage.getItem(`sm_${mode}_sessions`)!) as DialogueSession[]
  return sessions.find((session) => session.id === localStorage.getItem(`sm_${mode}_cur`))!
}

describe('opening persistence during page refresh', () => {
  beforeEach(() => {
    localStorage.clear()
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    })
    setActivePinia(createPinia())
  })

  it.each(['socratic', 'normal'] as const)(
    'restores the initial %s conversation instead of creating another opening',
    async (mode) => {
      const wrapper = await mountDialogue(mode)
      const original = cachedCurrentSession(mode)
      expect(original.messages).toHaveLength(1)
      expect(original.messages[0].role).toBe('ai')
      wrapper.unmount()

      const refreshed = await mountDialogue(mode)
      expect(cachedCurrentSession(mode).id).toBe(original.id)
      expect(refreshed.findComponent(MessageList).props('messages')).toEqual(original.messages)
      refreshed.unmount()
    },
  )

  it.each(['socratic', 'normal'] as const)(
    'saves a new %s conversation when the page refreshes before the debounce finishes',
    async (mode) => {
      const wrapper = await mountDialogue(mode)
      const previous = cachedCurrentSession(mode)
      await wrapper.get('[title="新建对话"]').trigger('click')
      const opening = wrapper.findComponent(MessageList).props('messages')
      expect(opening).toHaveLength(1)

      window.dispatchEvent(new Event('pagehide'))
      const saved = cachedCurrentSession(mode)
      expect(saved.id).not.toBe(previous.id)
      expect(saved.messages).toEqual(opening)
      wrapper.unmount()

      const refreshed = await mountDialogue(mode)
      expect(cachedCurrentSession(mode).id).toBe(saved.id)
      expect(refreshed.findComponent(MessageList).props('messages')).toEqual(opening)
      refreshed.unmount()
    },
  )
})
