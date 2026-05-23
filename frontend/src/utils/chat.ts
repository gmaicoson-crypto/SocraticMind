// 对话组件共享的纯函数：时间戳、ID 生成、用户意图判断

export function now(): string {
  return new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

export function nowDate(): string {
  return new Date().toLocaleDateString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export function genId(): string {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

// 从用户句子中提取想学的主题关键词
// 正则按长度倒排，确保"我想学习"先于"我想学"匹配，避免截断
export function extractTopic(text: string): string {
  const cleaned = text
    .replace(/想要学习|我想学习|我想了解|我想入门|帮我学习|帮我学|教教我|教我|想学习|想了解|想入门|学一下|学一学|了解一下|讲一讲|讲讲|我想学|想学|学习|了解|入门/g, '')
    .replace(/[的吧呢啊呀嘛么，。！？,!?\s]/g, '')
    .trim()
  return cleaned.length >= 2 ? cleaned : text.trim()
}

// 判断用户是否有新主题学习意图，决定是否进入 [CONFIRM] 流程
export function isNewTopicIntent(text: string): boolean {
  const keywords = ['我想学', '帮我学', '想学习', '想了解', '想入门', '学一下', '学一学']
  return keywords.some(k => text.includes(k)) && extractTopic(text).length >= 2
}

// 判断用户是否在确认操作
export function isConfirmation(text: string): boolean {
  const t = text.trim().toLowerCase()
  return [
    '确认', '确定', '好的', '好', '是的', '是', '生成', '开始',
    'ok', 'yes', '要', '可以', '行',
  ].some(k => t.includes(k))
}
