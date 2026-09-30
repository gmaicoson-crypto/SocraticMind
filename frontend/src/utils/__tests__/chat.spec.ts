import { describe, expect, it } from 'vitest'
import { extractTopic, formatMessageTime, isNewTopicIntent, retryableAiIndex } from '../chat'

describe('chat message presentation', () => {
  const today = new Date(2026, 8, 29, 17, 20)

  it('shows only 24-hour time today, month/day this year, and full date in other years', () => {
    expect(formatMessageTime(new Date(2026, 8, 29, 9, 5).toISOString(), today)).toBe('09:05')
    expect(formatMessageTime(new Date(2026, 0, 3, 9, 5).toISOString(), today)).toBe('01/03')
    expect(formatMessageTime(new Date(2025, 11, 31, 9, 5).toISOString(), today)).toBe('2025/12/31')
    expect(formatMessageTime('10:15', today)).toBe('10:15')
  })

  it('only permits retry when the last message is an AI reply to a user', () => {
    expect(retryableAiIndex([{ role: 'ai' }])).toBe(-1)
    expect(retryableAiIndex([{ role: 'ai' }, { role: 'user' }, { role: 'ai' }])).toBe(2)
    expect(retryableAiIndex([{ role: 'user' }, { role: 'ai' }, { role: 'user' }])).toBe(-1)
    expect(retryableAiIndex([{ role: 'user' }, { role: 'ai', messageType: 'agent_step' }])).toBe(-1)
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
