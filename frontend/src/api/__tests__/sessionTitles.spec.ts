import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../index'
import { getSessionTitles, renameSessionTitle, requestSessionTitle } from '../sessionTitles'
import { attachment } from '../../test/fixtures/attachments'

vi.mock('../index', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }))

describe('session title API', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('batches title reads and avoids empty reads', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] })
    await getSessionTitles([])
    expect(api.get).not.toHaveBeenCalled()
    await getSessionTitles(Array.from({ length: 101 }, (_, index) => `session-${index}`))
    expect(api.get).toHaveBeenCalledTimes(2)
    expect(vi.mocked(api.get).mock.calls[0][1]?.params.getAll('ids')).toHaveLength(100)
    expect(vi.mocked(api.get).mock.calls[1][1]?.params.getAll('ids')).toEqual(['session-100'])
  })

  it('sends bounded user content, selected model and attachment names', async () => {
    localStorage.setItem('sm_llm_model', 'chosen')
    vi.mocked(api.post).mockResolvedValue({ data: { title: null } })
    await requestSessionTitle('s', 'normal', {
      role: 'user',
      text: 'a'.repeat(5000),
      time: '',
      attachments: [attachment({ name: '讲义.pdf' })],
    })
    expect(api.post).toHaveBeenCalledWith('/api/chat/session-titles', {
      session_id: 's',
      mode: 'normal',
      message: 'a'.repeat(4000),
      attachment_names: ['讲义.pdf'],
      model: 'chosen',
    })
  })

  it('persists a manual title with an encoded session ID', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: { title: '笔记' } })
    expect(await renameSessionTitle('s/a', '笔记')).toEqual({ title: '笔记' })
    expect(api.put).toHaveBeenCalledWith('/api/chat/session-titles/s%2Fa', { title: '笔记' })
  })
})
