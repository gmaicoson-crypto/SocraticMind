// 热力图颜色阶梯（CSS 变量，支持深浅色主题）
export const heatColors = [
  'var(--heatmap-0)',
  'var(--heatmap-1)',
  'var(--heatmap-2)',
  'var(--heatmap-3)',
  'var(--heatmap-4)',
] as const

// 根据当日对话次数返回热力颜色
export function heatColor(count: number): string {
  if (count === 0) return heatColors[0]
  if (count <= 20) return heatColors[1]
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

// 当月第一天是星期几（0=周日），用于月历前置空白格
export function monthStartPad(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay()
}

// 生成指定月份每天的日期字符串与热力计数
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

// 上一个月，跨年时自动回退
export function prevMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 }
  return { year, month: month - 1 }
}

// 下一个月，跨年时自动前进
export function nextMonth(year: number, month: number): { year: number; month: number } {
  if (month === 12) return { year: year + 1, month: 1 }
  return { year, month: month + 1 }
}

// 可翻到上个月：限制范围为 [去年1月, 今月]
export function canGoPrev(year: number, month: number, today: Date = new Date()): boolean {
  return !(year === today.getFullYear() - 1 && month === 1)
}

export function canGoNext(year: number, month: number, today: Date = new Date()): boolean {
  return !(year === today.getFullYear() && month === today.getMonth() + 1)
}
