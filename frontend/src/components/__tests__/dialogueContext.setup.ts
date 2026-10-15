import { beforeEach, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SocraticDialogue from '../SocraticDialogue.vue'
import DialogueInputBar from '../dialogue/DialogueInputBar.vue'
import { createDefaultSession } from '../../composables/useChatSessions'
import { getAttachmentCapabilities } from '../../api/attachments'
import { attachmentCapabilities } from '../../test/fixtures/attachments'
import { chatStream, getSuggestions } from '../../api/chat'
import type { WebSnapshot } from '../../types/webSearch'

export async function mountDialogue(initialWeb?: WebSnapshot) {
  const session = createDefaultSession('normal')
  session.messages.push(
    { role: 'user', text: '原问题', time: '2026-01-01T00:00:01Z', db_id: 10 },
    {
      role: 'ai',
      text: '原回答',
      time: '2026-01-01T00:00:02Z',
      db_id: 11,
      metadata: initialWeb ? { web: initialWeb } : undefined,
    },
  )
  localStorage.setItem('sm_normal_sessions', JSON.stringify([session]))
  localStorage.setItem('sm_normal_cur', session.id)
  const wrapper = mount(SocraticDialogue, { global: { stubs: { teleport: true } } })
  wrapper.findComponent(DialogueInputBar).vm.$emit('update:chatMode', 'normal')
  await flushPromises()
  return { wrapper, session }
}

export function currentCall() {
  return vi.mocked(chatStream).mock.calls.at(-1)!
}

export function setupDialogueContext() {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.mocked(getSuggestions).mockResolvedValue({
      suggestions: Array.from({ length: 12 }, (_, index) => `推荐问题${index}`),
      source: 'ai',
    })
    vi.mocked(getAttachmentCapabilities).mockResolvedValue(attachmentCapabilities)
    setActivePinia(createPinia())
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    })
  })
}
