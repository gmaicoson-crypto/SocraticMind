/**
 * 用 <mark> 包裹文本中匹配查询词的部分，给搜索下拉做高亮。
 * regex 元字符必须先转义，否则用户输入 "a.b" 会被当作通配符。
 */
export function highlight(text: string, q: string): string {
  if (!q) return text
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>')
}
