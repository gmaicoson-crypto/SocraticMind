// highlight 工具模块，提供可复用的纯函数。
export function highlight(text: string, q: string): string {
  if (!q) return text

  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>')
}
