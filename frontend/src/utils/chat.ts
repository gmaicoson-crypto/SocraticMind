// chat 工具模块，提供可复用的纯函数。
import type { DialogueSession, Message } from '../types'

export function sessionNodeKey(session: DialogueSession | undefined): string | undefined {
  if (!session) return
  if (session.nodeKey !== undefined) return session.nodeKey ?? undefined
  // Older caches already contain the node in their saved request context.
  for (let index = session.messages.length - 1; index >= 0; index -= 1) {
    const request = session.messages[index]?.chatRequest
    if (request) return request.kind === 'topic_overview' ? undefined : request.nodeKey
  }
}

export function hasMessageContent(
  message: Pick<Message, 'text' | 'choices' | 'attachments'>,
): boolean {
  return Boolean(message.text.trim() || message.choices?.length || message.attachments?.length)
}

export function countCompletedChatTurns(messages: Message[]): number {
  let turns = 0
  let awaitingReply = false
  for (const message of messages) {
    if (message.messageType && message.messageType !== 'chat') continue
    if (message.role === 'user') {
      awaitingReply = hasMessageContent(message)
      continue
    }
    if (
      awaitingReply &&
      (!message.chatRequest || message.chatRequest.kind === 'qa') &&
      hasMessageContent(message) &&
      !['generating', 'interrupted', 'failed'].includes(String(message.metadata?.status ?? ''))
    ) {
      turns += 1
    }
    awaitingReply = false
  }
  return turns
}

export function now(): string {
  return new Date().toISOString()
}

const calendarDatePattern = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/

export function parseSessionDate(value: string, today = new Date()): Date | null {
  const calendarDate = calendarDatePattern.exec(value.trim())
  if (calendarDate) {
    // A scheduled day is a calendar date, so parsing must not shift it through UTC.
    const [, year, month, day] = calendarDate
    const date = new Date(Number(year), Number(month) - 1, Number(day))
    return date.getFullYear() === Number(year) &&
      date.getMonth() === Number(month) - 1 &&
      date.getDate() === Number(day)
      ? date
      : null
  }
  // Keep dates with only year/month precision intact rather than inventing a day.
  if (/^\d{4}(?:[-/]\d{1,2})?$/.test(value.trim())) return null
  const legacy = /^(?:(\d{4})[/-])?(\d{1,2})[/-](\d{1,2})[,，]?\s+(\d{1,2}):(\d{2})$/.exec(
    value.trim(),
  )
  if (legacy) {
    const [, year, month, day, hour, minute] = legacy
    const date = new Date(
      year ? Number(year) : today.getFullYear(),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
    )
    if (
      date.getMonth() !== Number(month) - 1 ||
      date.getDate() !== Number(day) ||
      Number(hour) > 23 ||
      Number(minute) > 59
    )
      return null
    if (!year && date.getTime() > today.getTime() + 24 * 60 * 60 * 1000)
      date.setFullYear(date.getFullYear() - 1)
    return date
  }
  const timestamp = Date.parse(value.trim().replace(' ', 'T').replaceAll('/', '-'))
  return Number.isNaN(timestamp) ? null : new Date(timestamp)
}

export function formatSessionTime(
  value: string,
  today = new Date(),
): { date: string; time: string } {
  const date = parseSessionDate(value, today)
  if (!date)
    return { date: '—', time: /^\d{1,2}:\d{2}$/.test(value) ? value.padStart(5, '0') : '—' }
  const pad = (part: number) => String(part).padStart(2, '0')
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  }
}

export function formatMessageTime(value: string, today = new Date()): string {
  const date = parseSessionDate(value, today)
  if (!date) return /^\d{1,2}:\d{2}$/.test(value) ? value.padStart(5, '0') : value || '—'
  const pad = (part: number) => String(part).padStart(2, '0')
  if (!calendarDatePattern.test(value.trim()) && date.toDateString() === today.toDateString()) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`
  }
  const day = `${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
  return date.getFullYear() === today.getFullYear() ? day : `${date.getFullYear()}/${day}`
}

export function formatFullTime(value: string, today = new Date()): string {
  const { date, time } = formatSessionTime(value, today)
  if (date === '—') return time === '—' ? value || '—' : time
  return calendarDatePattern.test(value.trim()) ? date : `${date} ${time}`
}

export function retryableAiIndex(
  messages: { role: 'ai' | 'user'; messageType?: string; chatRequest?: unknown }[],
): number {
  const index = messages.length - 1
  if (
    messages[index]?.role !== 'ai' ||
    (messages[index].messageType && messages[index].messageType !== 'chat')
  )
    return -1
  if (messages[index].chatRequest) return index
  for (let i = index - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return index
  }
  return -1
}

export function replyUserIndex(messages: Message[], aiIndex: number): number {
  const reply = messages[aiIndex]
  if (reply?.role !== 'ai') return -1
  const userId = reply.chatRequest?.userMessageId ?? reply.metadata?.user_message_id
  for (let i = aiIndex - 1; i >= 0; i--) {
    const message = messages[i]
    if (
      message.role === 'user' &&
      (!message.messageType || message.messageType === 'chat') &&
      (userId == null || message.db_id === userId)
    )
      return i
  }
  return -1
}

export function nowDate(): string {
  return now()
}

export function genId(): string {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

// Keep the intent phrase at the beginning of the input. Removing every
// occurrence of “学习” turns a topic such as “机器学习” into “机器”.
const topicIntentPrefix =
  /^(?:请|可以|能|能不能|能否)?\s*(?:教教我|教我|带我学习|带我学|带我入门|帮我学习|帮我学|我想要学习|我想要学|我想学习|我想学|我想了解|我想入门|想要学习|想要学|想学习|想学|想了解|想入门|学习一下|学一下|学一学|了解一下|入门|讲一讲|讲讲|学习|了解)\s*/

export function extractTopic(text: string): string {
  const cleaned = text
    .trim()
    .replace(topicIntentPrefix, '')
    .replace(/^[的吧呢啊呀嘛么，。！？,!?\s]+|[的吧呢啊呀嘛么，。！？,!?\s]+$/g, '')
    .trim()
  return cleaned.length >= 2 ? cleaned : ''
}

export function isNewTopicIntent(text: string): boolean {
  return topicIntentPrefix.test(text.trim()) && extractTopic(text).length >= 2
}

export function isConfirmation(text: string): boolean {
  const t = text.trim().toLowerCase()
  return [
    '确认',
    '确定',
    '好的',
    '好',
    '是的',
    '是',
    '生成',
    '开始',
    'ok',
    'yes',
    '要',
    '可以',
    '行',
  ].some((k) => t.includes(k))
}
