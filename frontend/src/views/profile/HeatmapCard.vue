<template>
  <div class="card heatmap-card">
    <div class="hm-header">
      <div class="card-title" style="margin-bottom:0">学习热力图</div>
      <div class="hm-controls">
        <button class="hm-nav-btn" :disabled="!canGoPrev" @click="onPrev">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <select v-model="selectedYear" class="hm-select">
          <option v-for="y in yearOptions" :key="y" :value="y">{{ y }} 年</option>
        </select>
        <select v-model="selectedMonth" class="hm-select">
          <option v-for="(m, i) in monthNames" :key="i" :value="i + 1">{{ m }}</option>
        </select>
        <button class="hm-nav-btn" :disabled="!canGoNext" @click="onNext">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="hm-month-wrap">
      <div class="hm-grid-wrap">
        <div class="hm-week-row">
          <span v-for="d in ['日','一','二','三','四','五','六']" :key="d">{{ d }}</span>
        </div>
        <div class="hm-month-grid">
          <div v-for="n in startPad" :key="`pad-${n}`" class="hm-cell empty" />
          <div
            v-for="day in monthDays"
            :key="day.date"
            class="hm-cell"
            :class="{ today: day.date === todayStr }"
            :style="{ background: heatColor(day.count) }"
            :title="`${day.date}：${day.count} 轮对话`"
          />
        </div>
      </div>
    </div>
    <div class="hm-footer">
      <div class="hm-legend">
        <span>少</span>
        <div v-for="c in heatColors" :key="c" class="hm-leg-cell" :style="{ background: c }" />
        <span>多</span>
      </div>
      <span class="hm-month-stat">本月 {{ monthChatCount }} 轮对话</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  heatColors, heatColor, monthNames,
  monthStartPad, buildMonthDays,
  prevMonth, nextMonth, canGoPrev as canGoPrevFn, canGoNext as canGoNextFn,
} from '../../utils/heatmap'

const props = defineProps<{
  heatmap: { date: string; count: number }[]
  todayStr: string
}>()

const today = new Date()
const selectedYear = ref(today.getFullYear())
const selectedMonth = ref(today.getMonth() + 1)

const yearOptions = computed(() => [today.getFullYear() - 1, today.getFullYear()])
const canGoPrev = computed(() => canGoPrevFn(selectedYear.value, selectedMonth.value, today))
const canGoNext = computed(() => canGoNextFn(selectedYear.value, selectedMonth.value, today))

function onPrev() {
  const r = prevMonth(selectedYear.value, selectedMonth.value)
  selectedYear.value = r.year
  selectedMonth.value = r.month
}
function onNext() {
  const r = nextMonth(selectedYear.value, selectedMonth.value)
  selectedYear.value = r.year
  selectedMonth.value = r.month
}

const startPad = computed(() => monthStartPad(selectedYear.value, selectedMonth.value))

// 建立日期索引，切月份时复用，不重复遍历 heatmap 数组
const heatmapByDate = computed(() =>
  Object.fromEntries(props.heatmap.map(h => [h.date, h.count]))
)

const monthDays = computed(() =>
  buildMonthDays(selectedYear.value, selectedMonth.value, heatmapByDate.value)
)

const monthChatCount = computed(() => monthDays.value.reduce((s, d) => s + d.count, 0))
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
.heatmap-card {
  display: flex; flex-direction: column; gap: 12px;
  justify-content: space-between;
}
.hm-header { display: flex; align-items: center; justify-content: space-between; }
.hm-controls { display: flex; align-items: center; gap: 6px; }
.hm-nav-btn {
  width: 26px; height: 26px;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-2); border: 1px solid var(--line); border-radius: 6px;
  color: var(--ink-2); cursor: pointer; transition: all .15s;
}
.hm-nav-btn:hover:not(:disabled) { background: var(--blue-tint); border-color: var(--blue-line); color: var(--blue-2); }
.hm-nav-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.hm-select {
  font-size: 12px; font-family: var(--font-sans); color: var(--ink);
  background: var(--bg-2); border: 1px solid var(--line);
  border-radius: 6px; padding: 3px 6px; cursor: pointer; outline: none;
}
.hm-month-wrap { display: flex; justify-content: center; align-items: center; flex: 1; }
.hm-grid-wrap { display: flex; flex-direction: column; gap: 4px; width: fit-content; }
.hm-week-row { display: grid; grid-template-columns: repeat(7, 20px); gap: 4px; }
.hm-week-row span {
  width: 20px; height: 14px;
  font-size: 9px; color: var(--ink-3); font-family: var(--font-mono);
  text-align: center; display: flex; align-items: center; justify-content: center;
}
.hm-month-grid {
  display: grid; grid-template-columns: repeat(7, 20px); grid-auto-rows: 20px;
  gap: 4px; width: fit-content;
}
.hm-cell { width: 20px; height: 20px; border-radius: 3px; transition: transform .1s; cursor: default; }
.hm-cell:hover { transform: scale(1.2); }
.hm-cell.empty { background: transparent !important; }
.hm-cell.today { outline: 2px solid var(--blue-2); outline-offset: 1px; }
.hm-footer { display: flex; align-items: center; justify-content: space-between; }
.hm-legend { display: flex; align-items: center; gap: 4px; font-size: 10px; color: var(--ink-3); }
.hm-leg-cell { width: 10px; height: 10px; border-radius: 2px; }
.hm-month-stat { font-size: 11px; color: var(--ink-3); font-family: var(--font-mono); }
</style>
