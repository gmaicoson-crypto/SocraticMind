// avatar 工具模块，提供可复用的纯函数。
import { normalizeAiAvatarUrl } from './avatarPresets'

export function avatarSrc(url: string | null | undefined): string {
  if (!url) return ''
  url = normalizeAiAvatarUrl(url)
  if (/^https?:\/\//.test(url)) return url
  if (url.startsWith('/avatars/')) return import.meta.env.BASE_URL.replace(/\/$/, '') + url
  const base = import.meta.env.VITE_API_BASE ?? ''
  return base.replace(/\/$/, '') + url
}
