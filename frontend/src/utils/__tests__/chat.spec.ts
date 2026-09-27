import { describe, expect, it } from 'vitest'
import { extractTopic, isNewTopicIntent } from '../chat'

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
