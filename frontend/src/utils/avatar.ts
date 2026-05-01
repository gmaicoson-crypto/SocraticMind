// 拼接后端返回的相对头像 URL 为可访问的完整地址
export function avatarSrc(url: string | null | undefined): string {
  if (!url) return ''
  if (/^https?:\/\//.test(url)) return url
  const base = import.meta.env.VITE_API_BASE ?? ''
  return base.replace(/\/$/, '') + url
}
