// 将文本中匹配查询词的部分用 <mark> 包裹，用于搜索结果高亮
export function highlight(text: string, q: string): string {
  if (!q) return text
  // 转义正则元字符，防止用户输入被当作通配符
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>')
}
