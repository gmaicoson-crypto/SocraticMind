<template>
  <div class="card weekly-card">
    <div class="card-title">本周学习概览</div>
    <div class="weekly-stats">
      <div class="weekly-item">
        <div class="weekly-icon">💬</div>
        <div class="weekly-info">
          <div class="weekly-num">{{ weekly?.chat_count ?? 0 }}</div>
          <div class="weekly-label">本周对话</div>
        </div>
      </div>
      <div class="weekly-item">
        <div class="weekly-icon">⭐</div>
        <div class="weekly-info">
          <div class="weekly-num">{{ weekly?.mastered_count ?? 0 }}</div>
          <div class="weekly-label">掌握节点</div>
        </div>
      </div>
      <div class="weekly-item">
        <div class="weekly-icon">📅</div>
        <div class="weekly-info">
          <div class="weekly-num">{{ weekly?.days_learned ?? 0 }} 天</div>
          <div class="weekly-label">学习天数</div>
        </div>
      </div>
      <div class="weekly-item">
        <div class="weekly-icon">📊</div>
        <div class="weekly-info">
          <div class="weekly-num">{{ weekly?.avg_daily ?? 0 }}</div>
          <div class="weekly-label">日均对话</div>
        </div>
      </div>
    </div>
    <div class="weekly-peak">
      <div class="weekly-peak-label">最活跃时段</div>
      <div class="weekly-peak-val">{{ weekly?.peak_hour ?? '暂无数据' }}</div>
    </div>
    <div class="weekly-days">
      <div v-for="(day, i) in weekDays" :key="i" class="weekly-day">
        <div class="weekly-day-bar-wrap">
          <div
            class="weekly-day-bar"
            :style="{
              height: day.count > 0 ? Math.min(day.count / maxWeekCount * 100, 100) + '%' : '4px',
              background: day.isToday ? 'var(--blue-2)' : day.count > 0 ? 'var(--blue)' : 'var(--bg-3)',
            }"
          />
        </div>
        <div class="weekly-day-label" :class="{ today: day.isToday }">{{ day.label }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface WeeklyStats {
  chat_count: number
  mastered_count: number
  peak_hour: string
  avg_daily: number
  days_learned: number
}

const props = defineProps<{
  weekly: WeeklyStats | undefined
  heatmap: { date: string; count: number }[]
  todayStr: string
}>()

const weekDayLabels = ['一', '二', '三', '四', '五', '六', '日']

// JS getDay() 0=周日，这里映射为 0=周一 … 6=周日
const weekDays = computed(() => {
  const heatmapMap = Object.fromEntries(props.heatmap.map(h => [h.date, h.count]))
  const today = new Date()
  const weekday = today.getDay() === 0 ? 6 : today.getDay() - 1
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() - weekday + i)
    const dateStr = d.toISOString().slice(0, 10)
    return {
      label: weekDayLabels[i],
      date: dateStr,
      count: heatmapMap[dateStr] ?? 0,
      isToday: dateStr === props.todayStr,
    }
  })
})

const maxWeekCount = computed(() => Math.max(...weekDays.value.map(d => d.count), 1))
</script>

<style scoped>
.card {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: 12px; padding: 18px 20px;
  display: flex; flex-direction: column;
}
.card-title {
  font-size: 11px; font-weight: 600; color: var(--ink-3);
  text-transform: uppercase; letter-spacing: 0.07em;
  font-family: var(--font-mono); margin-bottom: 14px;
}
.weekly-card { display: flex; flex-direction: column; gap: 12px; justify-content: space-between; }
.weekly-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.weekly-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; background: var(--bg-2); border-radius: 8px;
}
.weekly-icon { font-size: 15px; }
.weekly-num { font-size: 15px; font-weight: 700; color: var(--ink); font-family: var(--font-mono); }
.weekly-label { font-size: 10px; color: var(--ink-3); margin-top: 1px; }

.weekly-peak {
  display: flex; align-items: center; justify-content: space-between;
  padding: 7px 10px; background: var(--blue-tint);
  border-radius: 8px; border: 1px solid var(--blue-line);
}
.weekly-peak-label { font-size: 11px; color: var(--ink-3); }
.weekly-peak-val { font-size: 12px; font-weight: 600; color: var(--blue-2); font-family: var(--font-mono); }

.weekly-days { display: flex; gap: 4px; align-items: flex-end; height: 56px; }
.weekly-day { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; height: 100%; }
.weekly-day-bar-wrap { flex: 1; width: 100%; display: flex; align-items: flex-end; justify-content: center; }
.weekly-day-bar { width: 100%; min-height: 4px; border-radius: 3px 3px 0 0; transition: height .4s ease; }
.weekly-day-label { font-size: 9px; color: var(--ink-3); font-family: var(--font-mono); }
.weekly-day-label.today { color: var(--blue-2); font-weight: 600; }
</style>
