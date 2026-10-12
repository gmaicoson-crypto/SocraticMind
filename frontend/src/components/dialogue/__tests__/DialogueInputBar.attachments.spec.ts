import { shallowMount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DialogueInputBar from '../DialogueInputBar.vue'
import { attachment } from '../../../test/fixtures/attachments'
import type { AttachmentDraft } from '../../../types/attachments'
const draft: AttachmentDraft = {
  clientId: 'client-1',
  file: new File(['a'], 'a.pdf'),
  attachment: attachment(),
  uploadState: 'uploaded',
  progress: 100,
}
function setup() {
  return shallowMount(DialogueInputBar, {
    props: {
      input: '',
      chatMode: 'normal',
      aiStyle: '标准',
      aiStyleOptions: ['标准'],
      chips: [],
      chipsLoading: false,
      quotedText: '',
      isThinking: false,
      isGenerating: false,
      socraticBadge: 0,
      normalBadge: 0,
      placeholder: '输入',
      attachments: [draft],
      attachmentsDisabled: false,
      attachmentsReady: true,
      attachmentAccept: '.pdf,.png',
    },
  })
}
describe('attachment input', () => {
  it('sends attachment-only requests but blocks unready or unavailable-stage drafts', async () => {
    const w = setup()
    await w.get('.send-btn').trigger('click')
    expect(w.emitted('send')).toHaveLength(1)
    await w.setProps({ attachmentsReady: false })
    await w.get('textarea').trigger('keydown', { key: 'Enter' })
    expect(w.emitted('send')).toHaveLength(1)
    await w.setProps({ attachmentsReady: true, attachmentsDisabled: true })
    await w.get('textarea').trigger('keydown', { key: 'Enter' })
    expect(w.emitted('send')).toHaveLength(1)
    expect(w.get('.send-btn').attributes('disabled')).toBeDefined()
    await w.setProps({ input: '这是测评回答' })
    await w.get('.send-btn').trigger('click')
    expect(w.emitted('send')).toHaveLength(2)
    expect(w.props('attachments')).toHaveLength(1)
    w.unmount()
  })
  it('accepts file drops and image paste, preserving ordinary pasted text', async () => {
    const w = setup()
    const image = new File(['a'], 'a.png', { type: 'image/png' })
    await w.get('.input-wrap').trigger('drop', { dataTransfer: { files: [image] } })
    await w.get('textarea').trigger('paste', { clipboardData: { files: [image] } })
    expect(w.emitted('addAttachments')).toEqual([[[image]], [[image]]])
    await w.get('textarea').trigger('paste', { clipboardData: { files: [] } })
    expect(w.emitted('addAttachments')).toHaveLength(2)
    await w.setProps({ attachmentsDisabled: true })
    await w.get('.input-wrap').trigger('drop', { dataTransfer: { files: [image] } })
    expect(w.emitted('addAttachments')).toHaveLength(2)
    w.unmount()
  })
  it('selects images and documents together and allows selecting the same image again', async () => {
    const w = setup()
    const image = new File(['pixels'], 'a.png', { type: 'image/png' })
    const input = w.get<HTMLInputElement>('input[type="file"]')
    expect(input.attributes('accept')).toBe('.pdf,.png')
    expect(input.attributes('multiple')).toBeDefined()
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [image, draft.file],
    })
    await input.trigger('change')
    expect(w.emitted('addAttachments')).toEqual([[[image, draft.file]]])
    expect(input.element.value).toBe('')
    Object.defineProperty(input.element, 'files', { configurable: true, value: [image] })
    await input.trigger('change')
    expect(w.emitted('addAttachments')?.[1]).toEqual([[image]])
    w.unmount()
  })
  it('reads clipboard image items when the browser does not expose a file list', async () => {
    const w = setup()
    const image = new File(['pixels'], '', { type: 'image/png' })
    const imageItem = { kind: 'file', getAsFile: () => image }
    await w.get('textarea').trigger('paste', {
      clipboardData: {
        files: [],
        items: [{ kind: 'string' }, { kind: 'file', getAsFile: () => null }, imageItem],
      },
    })
    expect(w.emitted('addAttachments')).toEqual([[[image]]])
    await w.get('textarea').trigger('paste', {
      clipboardData: { files: [image], items: [imageItem] },
    })
    expect(w.emitted('addAttachments')).toEqual([[[image]], [[image]]])
    w.unmount()
  })
  it.each([{ attachmentsDisabled: true }, { isThinking: true }, { attachmentAccept: '' }])(
    'preserves the paste event when image uploads are unavailable: %j',
    async (props) => {
      const w = setup()
      await w.setProps(props)
      const image = new File(['pixels'], 'a.png', { type: 'image/png' })
      const event = new Event('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'clipboardData', { value: { files: [image] } })
      w.get('textarea').element.dispatchEvent(event)
      await w.get('.input-wrap').trigger('drop', { dataTransfer: { files: [image] } })
      expect(event.defaultPrevented).toBe(false)
      expect(w.emitted('addAttachments')).toBeUndefined()
      w.unmount()
    },
  )
})
