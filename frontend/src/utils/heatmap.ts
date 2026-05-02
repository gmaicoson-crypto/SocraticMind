// GitHub 风格热力图配色：浅灰底 + 4 档绿，30/60/120 阈值参考 GitHub 轻/中/重活跃区间
export const heatColors = [
  '#F0F0F0', // 0
  '#9BE9A8', // 1-30
  '#40C463', // 31-60
  '#30A14E', // 61-120
  '#216E39', // 120+
] as const

export function heatColor(count: number): string {
  if (count === 0) return heatColors[0]
  if (count <= 30) return heatColors[1]
  if (count <= 60) return heatColors[2]
  if (count <= 120) return heatColors[3]
  return heatColors[4]
}

export const monthNames = [
  '1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月',
] as const

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

/** 当月第一天落在星期几（0=周日），用来给月历前置空白格 */
export function monthStartPad(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay()
}

/** 给定 year/month，返回该月每一天的日期字符串与对应计数（来自 heatmap 字典） */
export function buildMonthDays(
  year: number,
  month: number,
  heatmapByDate: Record<string, number>,
): { date: string; count: number }[] {
  const daysInMonth = new Date(year, month, 0).getDate()
  return Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1
    const date = isoDate(year, month, d)
    return { date, count: heatmapByDate[date] ?? 0 }
  })
}

/** 上一个月，跨年自动回退 */
export function prevMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 }
  return { year, month: month - 1 }
}

/** 下一个月，跨年自动前进 */
export function nextMonth(year: number, month: number): { year: number; month: number } {
  if (month === 12) return { year: year + 1, month: 1 }
  return { year, month: month + 1 }
}

/** 仅允许在 [今年-1 1月, 今年当月] 区间翻动，避免跳到没有数据的未来或太久远的过去 */
export function canGoPrev(year: number, month: number, today: Date = new Date()): boolean {
  return !(year === today.getFullYear() - 1 && month === 1)
}

export function canGoNext(year: number, month: number, today: Date = new Date()): boolean {
  return !(year === today.getFullYear() && month === today.getMonth() + 1)
}
