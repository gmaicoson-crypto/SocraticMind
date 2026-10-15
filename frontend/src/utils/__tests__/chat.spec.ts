import { describe, expect, it } from 'vitest'
import {
  extractTopic,
  countCompletedChatTurns,
  formatMessageTime,
  formatFullTime,
  formatSessionTime,
  isNewTopicIntent,
  replyUserIndex,
  retryableAiIndex,
  sessionNodeKey,
} from '../chat'
import type { Message } from '../../types'
import { createDefaultSession } from '../../composables/useChatSessions'

describe('session history dates and node references', () => {
  it('formats ISO timestamps as a local date and minute time on separate lines', () => {
    const timestamp = new Date(2026, 9, 12, 5, 13, 49).toISOString()
    expect(formatSessionTime(timestamp)).toEqual({ date: '2026-10-12', time: '05:13' })
  })

  it('supports legacy local dates, explicit years and a previous December across New Year', () => {
    const today = new Date(2026, 9, 12, 8)
    expect(formatSessionTime('10/12 05:13', today)).toEqual({ date: '2026-10-12', time: '05:13' })
    expect(formatSessionTime('2024/10/12 05:13', today)).toEqual({
      date: '2024-10-12',
      time: '05:13',
    })
    expect(formatSessionTime('12/31 23:59', new Date(2026, 0, 3))).toEqual({
      date: '2025-12-31',
      time: '23:59',
    })
    expect(formatSessionTime('invalid')).toEqual({ date: '—', time: '—' })
    expect(formatSessionTime('5:13')).toEqual({ date: '—', time: '05:13' })
    expect(formatSessionTime('02/31 05:13', today)).toEqual({ date: '—', time: '—' })
  })

  it('recovers a node from legacy replies but treats a topic overview as unbound', () => {
    const session = createDefaultSession('socratic')
    session.messages.push({
      role: 'ai',
      text: '节点讨论',
      time: '',
      chatRequest: { nodeKey: 'tools', input: '', kind: 'node_overview' },
    })
    expect(sessionNodeKey(session)).toBe('tools')
    session.nodeKey = null
    expect(sessionNodeKey(session)).toBeUndefined()
    delete session.nodeKey
    session.messages.push({
      role: 'ai',
      text: '主题介绍',
      time: '',
      chatRequest: { nodeKey: 'AI基础', input: '', kind: 'topic_overview' },
    })
    expect(sessionNodeKey(session)).toBeUndefined()
  })
})

describe('chat message presentation', () => {
  const today = new Date(2026, 8, 29, 17, 20)

  it('counts completed question and answer rounds, excluding welcomes, overviews and failed replies', () => {
    const user: Message = { role: 'user', text: '问题', time: '' }
    const reply: Message = { role: 'ai', text: '回答', time: '' }
    const messages: Message[] = [
      { ...reply, text: '欢迎' },
      user,
      reply,
      { ...user, messageType: 'agent_answer' },
      { ...reply, messageType: 'agent_result' },
      { ...reply, chatRequest: { nodeKey: 'node', input: '', kind: 'node_overview' } },
      user,
      { ...reply, metadata: { status: 'interrupted' } },
      user,
      { ...reply, metadata: { status: 'failed' } },
      user,
      { ...reply, metadata: { status: 'generating' } },
      user,
      { ...reply, text: '' },
      user,
      { ...reply, text: '', choices: [{ label: 'A', text: '选项' }] },
      user,
    ]
    expect(countCompletedChatTurns(messages)).toBe(2)
    expect(countCompletedChatTurns([...messages, reply])).toBe(3)
    expect(countCompletedChatTurns([user, { ...reply, text: '重新生成的回答' }])).toBe(1)
  })

  it('shows only 24-hour time today, month/day this year, and full date in other years', () => {
    expect(formatMessageTime(new Date(2026, 8, 29, 9, 5).toISOString(), today)).toBe('09:05')
    expect(formatMessageTime(new Date(2026, 0, 3, 9, 5).toISOString(), today)).toBe('01/03')
    expect(formatMessageTime(new Date(2025, 11, 31, 9, 5).toISOString(), today)).toBe('2025/12/31')
    expect(formatMessageTime('10:15', today)).toBe('10:15')
  })

  it('preserves calendar dates without shifting through UTC or inventing a midnight time', () => {
    expect(formatMessageTime('2026-09-29', today)).toBe('09/29')
    expect(formatMessageTime('2026-01-03', today)).toBe('01/03')
    expect(formatMessageTime('2025-12-31', today)).toBe('2025/12/31')
    expect(formatFullTime('2026-09-29', today)).toBe('2026-09-29')
    expect(formatMessageTime('2026-02-31', today)).toBe('2026-02-31')
  })

  it('uses the same local time for equivalent instants with different timezone offsets', () => {
    expect(formatMessageTime('2026-09-29T16:05:00Z', today)).toBe(
      formatMessageTime('2026-09-30T00:05:00+08:00', today),
    )
    const timestamp = new Date(2026, 8, 29, 9, 5, 49).toISOString()
    expect(formatFullTime(timestamp, today)).toBe('2026-09-29 09:05')
  })

  it('supports legacy dates and preserves missing or partial timestamp precision', () => {
    expect(formatMessageTime('09/29 09:05', today)).toBe('09:05')
    expect(formatMessageTime('12/31 23:59', new Date(2026, 0, 3))).toBe('2025/12/31')
    expect(formatMessageTime('5:13', today)).toBe('05:13')
    expect(formatMessageTime('2026-05', today)).toBe('2026-05')
    expect(formatFullTime('2026-05', today)).toBe('2026-05')
    expect(formatMessageTime('2025', today)).toBe('2025')
    expect(formatMessageTime('invalid', today)).toBe('invalid')
    expect(formatMessageTime('', today)).toBe('—')
  })

  it('only permits retry when the last message is an AI reply to a user', () => {
    expect(retryableAiIndex([{ role: 'ai' }])).toBe(-1)
    expect(retryableAiIndex([{ role: 'ai' }, { role: 'user' }, { role: 'ai' }])).toBe(2)
    expect(retryableAiIndex([{ role: 'user' }, { role: 'ai' }, { role: 'user' }])).toBe(-1)
    expect(retryableAiIndex([{ role: 'user' }, { role: 'ai', messageType: 'agent_step' }])).toBe(-1)
  })

  it('finds the paired chat question and skips learning workflow answers', () => {
    const messages: Message[] = [
      { role: 'user', text: '问题', time: '10:00', db_id: 1 },
      { role: 'user', text: '流程答案', time: '10:01', db_id: 2, messageType: 'agent_answer' },
      { role: 'ai', text: '', time: '10:02', db_id: 3 },
    ]
    expect(replyUserIndex(messages, 2)).toBe(0)
    expect(replyUserIndex(messages, -1)).toBe(-1)
    expect(replyUserIndex(messages, 0)).toBe(-1)
    expect(
      replyUserIndex(
        [
          ...messages.slice(0, 2),
          {
            ...messages[2],
            chatRequest: { nodeKey: 'normal', input: '', kind: 'qa', userMessageId: 99 },
          },
        ],
        2,
      ),
    ).toBe(-1)
  })
})

describe('chat topic intent helpers', () => {
  it.each([
    ['教我机器学习', '机器学习'],
    ['请教我 机器学习吧', '机器学习'],
    ['我想学习 TypeScript', 'TypeScript'],
    ['我想要学 Python', 'Python'],
    ['带我学数据结构', '数据结构'],
    ['讲讲 数据库', '数据库'],
  ])('recognizes %s as a topic request', (input, topic) => {
    expect(isNewTopicIntent(input)).toBe(true)
    expect(extractTopic(input)).toBe(topic)
  })

  it.each(['教我', '我想学习', '请教我'])('rejects a request without a topic: %s', (input) => {
    expect(isNewTopicIntent(input)).toBe(false)
    expect(extractTopic(input)).toBe('')
  })
})
