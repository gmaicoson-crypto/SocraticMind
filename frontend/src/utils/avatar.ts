// 将后端返回的相对头像路径拼接为完整 URL
export function avatarSrc(url: string | null | undefined): string {
  if (!url) return ''
  if (/^https?:\/\//.test(url)) return url
  const base = import.meta.env.VITE_API_BASE ?? ''
  return base.replace(/\/$/, '') + url
}
