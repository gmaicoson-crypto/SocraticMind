// avatar 工具模块，提供可复用的纯函数。
export function avatarSrc(url: string | null | undefined): string {
  if (!url) return ''
  if (/^https?:\/\//.test(url)) return url
  const base = import.meta.env.VITE_API_BASE ?? ''
  return base.replace(/\/$/, '') + url
}
