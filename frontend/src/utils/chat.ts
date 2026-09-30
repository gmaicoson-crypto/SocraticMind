// chat 工具模块，提供可复用的纯函数。
export function now(): string {
  return new Date().toISOString()
}

export function formatMessageTime(value: string, today = new Date()): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (part: number) => String(part).padStart(2, '0')
  if (date.toDateString() === today.toDateString()) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`
  }
  const day = `${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
  return date.getFullYear() === today.getFullYear() ? day : `${date.getFullYear()}/${day}`
}

export function retryableAiIndex(
  messages: { role: 'ai' | 'user'; messageType?: string }[],
): number {
  const index = messages.length - 1
  if (
    messages[index]?.role !== 'ai' ||
    (messages[index].messageType && messages[index].messageType !== 'chat')
  )
    return -1
  for (let i = index - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return index
  }
  return -1
}

export function nowDate(): string {
  return new Date().toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
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
