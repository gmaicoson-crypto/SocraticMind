import type { WebSnapshot, WebStatus } from '../types/webSearch'

export function safeWebUrl(value: string): string | null {
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null
  } catch {
    return null
  }
}

export function messageWeb(metadata?: Record<string, unknown> | null): WebSnapshot | undefined {
  const web = metadata?.web as WebSnapshot | undefined
  return web?.schema_version === 1 &&
    Array.isArray(web.sources) &&
    Array.isArray(web.cited_source_ids)
    ? web
    : undefined
}

export const webStatusText: Record<WebStatus, string> = {
  off: '联网已关闭',
  skipped: '本次无需联网',
  deciding: '正在判断是否需要联网…',
  searching: '正在搜索资料…',
  ready: '已检索资料',
  failed: '本次未能完成联网核实',
  unavailable: '联网暂不可用',
}
