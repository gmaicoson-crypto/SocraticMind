<template>
  <div class="profile-page">
    <TopBar />
    <div class="profile-body">

      <!-- 个人信息 Hero -->
      <div class="hero-card">
        <div class="big-avatar" :style="{ background: store.userInfo?.avatar_grad }">
          {{ userName.slice(0, 1) }}
          <div class="level-badge">LV 4 · APPRENTICE</div>
        </div>
        <div class="hero-info">
          <div class="hero-name">{{ userName }}</div>
          <div class="hero-sig">「{{ userBio }}」</div>
          <div class="stat-row">
            <div class="stat">
              <div class="stat-num">{{ store.masteredCount }}</div>
              <div class="stat-label">已掌握节点</div>
            </div>
            <div class="stat-div" />
            <div class="stat">
              <div class="stat-num">{{ store.topics.length }}</div>
              <div class="stat-label">学习主题</div>
            </div>
            <div class="stat-div" />
            <div class="stat">
              <div class="stat-num">{{ stats.chat_count }}</div>
              <div class="stat-label">对话轮次</div>
            </div>
            <div class="stat-div" />
            <div class="stat">
              <div class="stat-num">{{ stats.streak }}</div>
              <div class="stat-label">连续天数</div>
            </div>
          </div>
        </div>
        <div class="hero-actions">
          <button class="back-btn" @click="router.push('/')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            返回对话
          </button>
          <button class="edit-btn" @click="showEditModal = true">编辑资料</button>
          <div class="streak-chip">✦ 连续学习 {{ stats.streak }} 天</div>
        </div>
      </div>

      <!-- 三列：热力图 + 今日目标 + 本周统计 -->
      <div class="grid-3col">

        <!-- 热力图 -->
        <div class="card heatmap-card">
          <div class="hm-header">
            <div class="card-title" style="margin-bottom:0">学习热力图</div>
            <div class="hm-controls">
              <button class="hm-nav-btn" :disabled="!canGoPrev" @click="prevMonth">
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
              <button class="hm-nav-btn" :disabled="!canGoNext" @click="nextMonth">
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
                <div v-for="n in monthStartPad" :key="`pad-${n}`" class="hm-cell empty" />
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

        <!-- 今日目标 -->
        <div class="card goal-card">
          <div class="goal-header">
            <div class="card-title" style="margin-bottom:0">今日目标</div>
            <button class="goal-edit-btn" title="设置目标" @click="showGoalModal = true">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </button>
          </div>
          <div class="ring-area">
            <svg width="100" height="100" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="38" fill="none" stroke="var(--bg-3)" stroke-width="10"/>
              <circle
                cx="50" cy="50" r="38" fill="none" stroke="var(--blue-2)" stroke-width="10"
                :stroke-dasharray="circumference" :stroke-dashoffset="dashOffset"
                stroke-linecap="round" transform="rotate(-90 50 50)"
              />
              <text x="50" y="47" text-anchor="middle" font-size="18" font-weight="700" fill="var(--ink)" font-family="monospace">{{ totalGoalPct }}%</text>
              <text x="50" y="61" text-anchor="middle" font-size="9" fill="var(--ink-3)">{{ doneGoalCount }}/{{ enabledGoalCount }} 目标</text>
            </svg>
          </div>
          <div class="goal-list">
            <div v-for="goal in goalItems" :key="goal.key" class="goal-item">
              <div class="goal-item-main">
                <span class="goal-label">{{ goal.label }}</span>
                <span class="goal-val" :class="{ done: goal.done }">
                  {{ goal.done ? '✓ 完成' : goal.val }}
                </span>
              </div>
              <div class="goal-progress-bar">
                <div class="goal-progress-fill" :style="{ width: Math.min(goal.pct, 100) + '%', background: goal.done ? 'var(--blue-2)' : 'var(--blue)' }" />
              </div>
            </div>
          </div>
        </div>

        <!-- 目标设置弹窗 -->
        <Teleport to="body">
          <Transition name="fade">
            <div v-if="showGoalModal" class="goal-modal-overlay" @click.self="showGoalModal = false">
              <div class="goal-modal">
                <div class="goal-modal-header">
                  <div class="goal-modal-title">设置今日目标</div>
                  <button class="goal-modal-close" @click="showGoalModal = false">✕</button>
                </div>
                <div class="goal-modal-body">
                  <div v-for="item in goalEditItems" :key="item.key" class="goal-edit-row">
                    <div class="goal-edit-left">
                      <label class="goal-toggle">
                        <input type="checkbox" v-model="item.enabled" />
                        <span class="goal-toggle-slider" />
                      </label>
                      <div>
                        <div class="goal-edit-label">{{ item.label }}</div>
                        <div class="goal-edit-sub">{{ item.sub }}</div>
                      </div>
                    </div>
                    <div class="goal-edit-right">
                      <button class="goal-num-btn" :disabled="!item.enabled || item.target <= 1" @click="item.target--">−</button>
                      <input
                        class="goal-num-input"
                        type="number"
                        v-model.number="item.target"
                        :disabled="!item.enabled"
                        :min="1"
                        @input="item.target = Math.max(1, item.target)"
                      />
                      <span class="goal-unit">{{ item.unit }}</span>
                      <button class="goal-num-btn" :disabled="!item.enabled" @click="item.target++">＋</button>
                    </div>
                  </div>
                </div>
                <div class="goal-modal-footer">
                  <div class="goal-reset-btn" @click="resetGoalToDefault">恢复默认</div>
                  <button class="goal-save-btn" @click="saveGoal">保存目标</button>
                </div>
              </div>
            </div>
          </Transition>
        </Teleport>

        <!-- 本周统计 -->
        <div class="card weekly-card">
          <div class="card-title">本周学习概览</div>
          <div class="weekly-stats">
            <div class="weekly-item">
              <div class="weekly-icon">💬</div>
              <div class="weekly-info">
                <div class="weekly-num">{{ stats.weekly?.chat_count ?? 0 }}</div>
                <div class="weekly-label">本周对话</div>
              </div>
            </div>
            <div class="weekly-item">
              <div class="weekly-icon">⭐</div>
              <div class="weekly-info">
                <div class="weekly-num">{{ stats.weekly?.mastered_count ?? 0 }}</div>
                <div class="weekly-label">掌握节点</div>
              </div>
            </div>
            <div class="weekly-item">
              <div class="weekly-icon">📅</div>
              <div class="weekly-info">
                <div class="weekly-num">{{ stats.weekly?.days_learned ?? 0 }} 天</div>
                <div class="weekly-label">学习天数</div>
              </div>
            </div>
            <div class="weekly-item">
              <div class="weekly-icon">📊</div>
              <div class="weekly-info">
                <div class="weekly-num">{{ stats.weekly?.avg_daily ?? 0 }}</div>
                <div class="weekly-label">日均对话</div>
              </div>
            </div>
          </div>
          <div class="weekly-peak">
            <div class="weekly-peak-label">最活跃时段</div>
            <div class="weekly-peak-val">{{ stats.weekly?.peak_hour ?? '暂无数据' }}</div>
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

      </div>

      <!-- 主题进度 -->
      <div>
        <div class="section-title">学习主题进度</div>
        <div class="grid-topics">
          <div
            v-for="(topic, idx) in store.topics"
            :key="topic.id"
            class="topic-card"
            @click="router.push('/')"
          >
            <div class="tc-top">
              <div class="tc-emoji">{{ topic.emoji }}</div>
              <div>
                <div class="tc-title">{{ topic.title }}</div>
                <div class="tc-sub">{{ topic.nodes }} 节点</div>
              </div>
            </div>
            <div class="tc-track">
              <div
                class="tc-fill"
                :style="{
                  width: (topic.nodes ? topic.mastered / topic.nodes * 100 : 0) + '%',
                  background: topicColor(idx),
                }"
              />
            </div>
            <div class="tc-footer">
              <span>{{ topic.mastered }} / {{ topic.nodes }} 已掌握</span>
              <span>{{ Math.round(topic.mastered / topic.nodes * 100) || 0 }}%</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 成就徽章 -->
      <div class="card">
        <div class="card-title">成就徽章</div>
        <div class="badge-grid">
          <div
            v-for="badge in stats.badges"
            :key="badge.name"
            class="badge"
            :class="{ unlocked: badge.unlocked, locked: !badge.unlocked }"
            :title="badge.name"
          >
            <div class="badge-icon">{{ badge.icon }}</div>
            <div class="badge-name">{{ badge.name }}</div>
          </div>
        </div>
      </div>

      <!-- 学习时间线 -->
      <div class="card">
        <div class="card-title">最近记录</div>
        <div class="timeline">
          <div v-if="stats.timeline.length === 0" style="color: var(--ink-3); font-size: 13px; padding: 12px 0;">
            还没有学习记录，开始学习吧！
          </div>
          <div v-for="r in stats.timeline" :key="r.title + r.time" class="tl-item">
            <div class="tl-dot" :class="r.type" />
            <div class="tl-content">
              <div class="tl-title">{{ r.title }}</div>
              <div class="tl-sub">{{ r.sub }}</div>
            </div>
            <div class="tl-time">{{ r.time }}</div>
          </div>
        </div>
      </div>

    </div>
  </div>
  <EditProfileModal v-if="showEditModal" @close="showEditModal = false" />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useLearningStore } from '../stores/learning'
import TopBar from '../components/TopBar.vue'
import EditProfileModal from '../components/EditProfileModal.vue'
import { getProfileStats } from '../api/progress'
import {
  loadGoalConfig, saveGoalConfig, getDefaultGoal, loadTodayProgress,
  type DailyGoalConfig
} from '../utils/dailyGoal'
import type { ProfileStats } from '../api/progress'

const showEditModal = ref(false)
const store = useLearningStore()
const router = useRouter()

const stats = ref<ProfileStats>({
  chat_count: 0,
  mastered_count: 0,
  streak: 0,
  heatmap: [],
  timeline: [],
  badges: [],
  weekly: {
    chat_count: 0,
    mastered_count: 0,
    peak_hour: '暂无数据',
    avg_daily: 0,
    days_learned: 0,
  },
})

onMounted(async () => {
  try {
    stats.value = await getProfileStats()
  } catch (err) {
    console.error('加载统计数据失败', err)
  }
})

const userName = computed(() => store.userInfo?.username ?? '学习者')
const userBio = computed(() => store.userInfo?.bio ?? '每一个问题都是通往掌握的一步')

// 热力图
const today = new Date()
const todayStr = today.toISOString().slice(0, 10)
const selectedYear = ref(today.getFullYear())
const selectedMonth = ref(today.getMonth() + 1)
const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
// const heatColors = ['#EBE6DF', '#B5D4F4', '#5BA3D9', '#2E7FBB', '#0C447C']
// const heatColors = ['#F0EAD6', '#D4E09B', '#A4C3B2', '#6B9080', '#455E54']
const heatColors = [
  '#F0F0F0', // 0% - 浅灰色，确保在白底上能看出格子轮廓
  '#9BE9A8', // 25%
  '#40C463', // 50%
  '#30A14E', // 75%
  '#216E39'  // 100%
];



const yearOptions = computed(() => {
  const cur = today.getFullYear()
  return [cur - 1, cur]
})

const canGoPrev = computed(() =>
  !(selectedYear.value === today.getFullYear() - 1 && selectedMonth.value === 1)
)
const canGoNext = computed(() =>
  !(selectedYear.value === today.getFullYear() && selectedMonth.value === today.getMonth() + 1)
)

function prevMonth() {
  if (selectedMonth.value === 1) { selectedMonth.value = 12; selectedYear.value-- }
  else selectedMonth.value--
}
function nextMonth() {
  if (selectedMonth.value === 12) { selectedMonth.value = 1; selectedYear.value++ }
  else selectedMonth.value++
}

const monthStartPad = computed(() =>
  new Date(selectedYear.value, selectedMonth.value - 1, 1).getDay()
)

const monthDays = computed(() => {
  const daysInMonth = new Date(selectedYear.value, selectedMonth.value, 0).getDate()
  const heatmapMap = Object.fromEntries(stats.value.heatmap.map(h => [h.date, h.count]))
  return Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1
    const dateStr = `${selectedYear.value}-${String(selectedMonth.value).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    return { date: dateStr, count: heatmapMap[dateStr] ?? 0 }
  })
})

const monthChatCount = computed(() => monthDays.value.reduce((s, d) => s + d.count, 0))

function heatColor(count: number) {
  if (count === 0) return heatColors[0]
  if (count <= 30) return heatColors[1]
  if (count <= 60) return heatColors[2]
  if (count <= 120) return heatColors[3]
  return heatColors[4]
}

// 今日目标
const circumference = 2 * Math.PI * 38
const showGoalModal = ref(false)

// 加载目标配置
const goalConfig = ref<DailyGoalConfig>(getDefaultGoal())

onMounted(() => {
  if (store.userInfo?.id) {
    goalConfig.value = loadGoalConfig(store.userInfo.id)
  }
})

// 今日进度数据
const todayChatCount = computed(() => {
  const cell = stats.value.heatmap.find(h => h.date === todayStr)
  return cell?.count ?? 0
})

const todayMasteredCount = computed(() => {
  return stats.value.timeline.filter(t => {
    const today = new Date().toISOString().slice(0, 10)
    return t.time.includes(today.slice(5)) // MM/DD 匹配
  }).length
})

const todayStudyMinutes = computed(() => {
  if (!store.userInfo?.id) return 0
  return loadTodayProgress(store.userInfo.id).study_minutes
})

// 目标列表
const goalItems = computed(() => {
  const cfg = goalConfig.value
  const items = []
  if (cfg.chat_count.enabled) {
    const done = todayChatCount.value >= cfg.chat_count.target
    const pct = Math.min(todayChatCount.value / cfg.chat_count.target * 100, 100)
    items.push({
      key: 'chat_count',
      label: `完成对话 ${cfg.chat_count.target} 轮`,
      val: `${todayChatCount.value}/${cfg.chat_count.target}`,
      done, pct,
    })
  }
  if (cfg.mastered_nodes.enabled) {
    const done = stats.value.mastered_count >= cfg.mastered_nodes.target
    const pct = Math.min(stats.value.mastered_count / cfg.mastered_nodes.target * 100, 100)
    items.push({
      key: 'mastered_nodes',
      label: `掌握 ${cfg.mastered_nodes.target} 个节点`,
      val: `${stats.value.mastered_count}/${cfg.mastered_nodes.target}`,
      done, pct,
    })
  }
  if (cfg.completed_topics.enabled) {
    const completedTopics = store.topics.filter(t => t.nodes > 0 && t.mastered === t.nodes).length
    const done = completedTopics >= cfg.completed_topics.target
    const pct = Math.min(completedTopics / cfg.completed_topics.target * 100, 100)
    items.push({
      key: 'completed_topics',
      label: `完成 ${cfg.completed_topics.target} 个主题`,
      val: `${completedTopics}/${cfg.completed_topics.target}`,
      done, pct,
    })
  }
  if (cfg.study_minutes.enabled) {
    const done = todayStudyMinutes.value >= cfg.study_minutes.target
    const pct = Math.min(todayStudyMinutes.value / cfg.study_minutes.target * 100, 100)
    items.push({
      key: 'study_minutes',
      label: `学习 ${cfg.study_minutes.target} 分钟`,
      val: `${todayStudyMinutes.value}/${cfg.study_minutes.target}`,
      done, pct,
    })
  }
  return items
})

const enabledGoalCount = computed(() => goalItems.value.length)
const doneGoalCount = computed(() => goalItems.value.filter(g => g.done).length)
const totalGoalPct = computed(() =>
  enabledGoalCount.value === 0 ? 0
  : Math.round(doneGoalCount.value / enabledGoalCount.value * 100)
)
const dashOffset = computed(() => circumference - (totalGoalPct.value / 100) * circumference)

// 编辑弹窗数据
const goalEditItems = reactive([
  {
    key: 'chat_count',
    label: '学习对话次数',
    sub: '完成苏格拉底式对话的轮次',
    unit: '轮',
    enabled: true,
    target: 5,
  },
  {
    key: 'mastered_nodes',
    label: '掌握节点数',
    sub: '今日标记为已掌握的知识节点',
    unit: '个',
    enabled: true,
    target: 2,
  },
  {
    key: 'completed_topics',
    label: '完成主题数',
    sub: '今日全部节点已掌握的主题',
    unit: '个',
    enabled: false,
    target: 1,
  },
  {
    key: 'study_minutes',
    label: '学习时长',
    sub: '在学习页面停留的时间',
    unit: '分钟',
    enabled: true,
    target: 30,
  },
])

watch(showGoalModal, (val) => {
  if (val) {
    const cfg = goalConfig.value
    goalEditItems[0].enabled = cfg.chat_count.enabled
    goalEditItems[0].target = cfg.chat_count.target
    goalEditItems[1].enabled = cfg.mastered_nodes.enabled
    goalEditItems[1].target = cfg.mastered_nodes.target
    goalEditItems[2].enabled = cfg.completed_topics.enabled
    goalEditItems[2].target = cfg.completed_topics.target
    goalEditItems[3].enabled = cfg.study_minutes.enabled
    goalEditItems[3].target = cfg.study_minutes.target
  }
})
function saveGoal() {
  const newConfig: DailyGoalConfig = {
    chat_count:       { enabled: goalEditItems[0].enabled, target: goalEditItems[0].target },
    mastered_nodes:   { enabled: goalEditItems[1].enabled, target: goalEditItems[1].target },
    completed_topics: { enabled: goalEditItems[2].enabled, target: goalEditItems[2].target },
    study_minutes:    { enabled: goalEditItems[3].enabled, target: goalEditItems[3].target },
  }
  goalConfig.value = newConfig
  if (store.userInfo?.id) saveGoalConfig(store.userInfo.id, newConfig)
  showGoalModal.value = false
}

function resetGoalToDefault() {
  const def = getDefaultGoal()
  goalEditItems[0].enabled = def.chat_count.enabled
  goalEditItems[0].target = def.chat_count.target
  goalEditItems[1].enabled = def.mastered_nodes.enabled
  goalEditItems[1].target = def.mastered_nodes.target
  goalEditItems[2].enabled = def.completed_topics.enabled
  goalEditItems[2].target = def.completed_topics.target
  goalEditItems[3].enabled = def.study_minutes.enabled
  goalEditItems[3].target = def.study_minutes.target
}

// 本周每天柱状图
const weekDayLabels = ['一', '二', '三', '四', '五', '六', '日']
const weekDays = computed(() => {
  const heatmapMap = Object.fromEntries(stats.value.heatmap.map(h => [h.date, h.count]))
  const todayDate = new Date()
  const weekday = todayDate.getDay() === 0 ? 6 : todayDate.getDay() - 1
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(todayDate)
    d.setDate(todayDate.getDate() - weekday + i)
    const dateStr = d.toISOString().slice(0, 10)
    return {
      label: weekDayLabels[i],
      date: dateStr,
      count: heatmapMap[dateStr] ?? 0,
      isToday: dateStr === todayStr,
    }
  })
})
const maxWeekCount = computed(() => Math.max(...weekDays.value.map(d => d.count), 1))

// 主题颜色
const topicColors = ['#2E7FBB', '#1D9E75', '#BA7517', '#993556', '#5B4BB5', '#BB572E']
function topicColor(index: number) {
  return topicColors[index % topicColors.length]
}
</script>

<style scoped>
.profile-page {
  display: flex; flex-direction: column;
  height: 100vh; overflow: hidden; background: var(--bg);
}

.profile-body {
  flex: 1; overflow-y: auto;
  padding: 20px 28px;
  display: flex; flex-direction: column; gap: 16px;
}

/* Hero */
.hero-card {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: 14px; padding: 24px 28px;
  display: flex; align-items: center; gap: 24px;
}

.big-avatar {
  width: 72px; height: 72px; border-radius: 18px;
  background: linear-gradient(135deg, oklch(0.85 0.06 60), oklch(0.7 0.10 35));
  color: white; font-size: 26px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; position: relative;
}

.level-badge {
  position: absolute; bottom: -10px; left: 50%;
  transform: translateX(-50%);
  background: var(--blue-2); color: white;
  font-size: 9px; font-weight: 600; padding: 2px 8px;
  border-radius: 99px; white-space: nowrap;
  font-family: var(--font-mono); letter-spacing: 0.04em;
  border: 2px solid var(--surface);
}

.hero-info { flex: 1; }
.hero-name { font-size: 20px; font-weight: 700; color: var(--ink); letter-spacing: -0.01em; }
.hero-sig { font-size: 12.5px; color: var(--ink-2); margin-top: 3px; margin-bottom: 16px; }
.stat-row { display: flex; gap: 20px; align-items: center; }
.stat { text-align: center; }
.stat-num { font-size: 20px; font-weight: 700; color: var(--ink); font-family: var(--font-mono); }
.stat-label { font-size: 10px; color: var(--ink-3); margin-top: 1px; }
.stat-div { width: 0.5px; height: 32px; background: var(--line); }

.hero-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
.back-btn { display: inline-flex; align-items: center; gap: 5px; }
.edit-btn, .back-btn {
  padding: 7px 16px; border-radius: 8px; border: 2px solid var(--line);
  background: var(--surface); font-size: 12px; font-weight: 500;
  color: var(--ink-2); cursor: pointer; font-family: var(--font-sans); transition: background .15s;
}
.edit-btn:hover, .back-btn:hover { background: var(--bg-2); }
.streak-chip {
  display: flex; align-items: center; gap: 5px; padding: 5px 12px;
  background: var(--blue-tint); border: 0.5px solid var(--blue-line);
  border-radius: 99px; font-size: 11.5px; font-weight: 600; color: var(--blue-2);
}

/* 三列布局：热力图占2份，另外两个各占1份 */
.grid-3col {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;  /* 改为等分 */
  gap: 16px;
  align-items: stretch;  /* 改为 stretch 统一高度 */
}

.grid-topics {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

/* Card */
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 18px 20px;
  display: flex;          /* 加这行 */
  flex-direction: column; /* 加这行 */
}
.card-title {
  font-size: 11px; font-weight: 600; color: var(--ink-3);
  text-transform: uppercase; letter-spacing: 0.07em;
  font-family: var(--font-mono); margin-bottom: 14px;
}
.section-title {
  font-size: 11px; font-weight: 600; color: var(--ink-3);
  text-transform: uppercase; letter-spacing: 0.07em;
  font-family: var(--font-mono); margin-bottom: 10px;
}

/* 热力图 */
.heatmap-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  justify-content: space-between;  /* 加这行，让内容撑开 */
}
.hm-header { display: flex; align-items: center; justify-content: space-between; }
.hm-controls { display: flex; align-items: center; gap: 6px; }
.hm-nav-btn {
  width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;
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
.hm-month-wrap {
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1;
}
.hm-grid-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: fit-content;
}
.hm-week-row {
  display: grid;
  grid-template-columns: repeat(7, 20px);
  gap: 4px;
}
.hm-week-row span {
  width: 20px;
  height: 14px;
  font-size: 9px;
  color: var(--ink-3);
  font-family: var(--font-mono);
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
}
.hm-month-grid {
  display: grid;
  grid-template-columns: repeat(7, 20px);
  grid-auto-rows: 20px;
  gap: 4px;
  width: fit-content;
}
.hm-cell {
  width: 20px;   /* 从 16px 改为 20px */
  height: 20px;  /* 从 16px 改为 20px */
  border-radius: 3px;
  transition: transform .1s;
  cursor: default;
}
.hm-cell:hover { transform: scale(1.2); }
.hm-cell.empty { background: transparent !important; }
.hm-cell.today { outline: 2px solid var(--blue-2); outline-offset: 1px; }
.hm-footer { display: flex; align-items: center; justify-content: space-between; }
.hm-legend { display: flex; align-items: center; gap: 4px; font-size: 10px; color: var(--ink-3); }
.hm-leg-cell { width: 10px; height: 10px; border-radius: 2px; }
.hm-month-stat { font-size: 11px; color: var(--ink-3); font-family: var(--font-mono); }

/* 今日目标 */
.goal-card { display: flex; flex-direction: column; gap: 0; }

.goal-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 14px;
}

.goal-edit-btn {
  width: 24px; height: 24px;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-2); border: 1px solid var(--line);
  border-radius: 6px; color: var(--ink-3); cursor: pointer; transition: all .15s;
}
.goal-edit-btn:hover { background: var(--blue-tint); border-color: var(--blue-line); color: var(--blue-2); }

.goal-item-left { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }

.goal-progress-bar {
  height: 3px; background: var(--bg-3); border-radius: 99px; overflow: hidden;
}
.goal-progress-fill { height: 100%; border-radius: 99px; transition: width .4s ease; }

/* 目标设置弹窗 */
.goal-modal-overlay {
  position: fixed; inset: 0; z-index: 300;
  background: rgba(0,0,0,0.3); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
}

.goal-modal {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: 16px; width: 380px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.15);
  display: flex; flex-direction: column;
}

.goal-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--line);
}

.goal-modal-title { font-size: 15px; font-weight: 700; color: var(--ink); }

.goal-modal-close {
  background: transparent; border: none; color: var(--ink-3);
  cursor: pointer; font-size: 14px; padding: 2px 6px; border-radius: 4px;
}
.goal-modal-close:hover { background: var(--bg-2); color: var(--ink); }

.goal-modal-body {
  padding: 14px 20px;
  display: flex; flex-direction: column; gap: 14px;
}

.goal-edit-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 12px; border-radius: 10px; background: var(--bg-2);
}

.goal-edit-left { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }

.goal-edit-label { font-size: 13px; font-weight: 500; color: var(--ink); }
.goal-edit-sub { font-size: 10.5px; color: var(--ink-3); margin-top: 1px; }

.goal-edit-right {
  display: flex; align-items: center; gap: 6px; flex-shrink: 0;
}

.goal-num-btn {
  width: 24px; height: 24px; border-radius: 6px;
  background: var(--surface); border: 1px solid var(--line);
  color: var(--ink); cursor: pointer; font-size: 14px;
  display: flex; align-items: center; justify-content: center;
  transition: all .15s;
}
.goal-num-btn:hover:not(:disabled) { background: var(--blue-tint); border-color: var(--blue-line); color: var(--blue-2); }
.goal-num-btn:disabled { opacity: 0.35; cursor: not-allowed; }

.goal-num-input {
  width: 48px;
  height: 28px;
  text-align: center;
  font-size: 14px;
  font-weight: 700;
  font-family: var(--font-mono);
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 6px;
  outline: none;
  padding: 0 4px;
  transition: border-color .15s;
}
.goal-num-input:focus { border-color: var(--blue); }
.goal-num-input:disabled { opacity: 0.4; cursor: not-allowed; }

/* 去掉数字输入框的上下箭头 */
.goal-num-input::-webkit-outer-spin-button,
.goal-num-input::-webkit-inner-spin-button { -webkit-appearance: none; }
.goal-num-input[type=number] { -moz-appearance: textfield; }
.goal-unit { font-size: 11px; color: var(--ink-3); }

/* Toggle 开关 */
.goal-toggle { position: relative; display: inline-block; width: 34px; height: 20px; flex-shrink: 0; }
.goal-toggle input { opacity: 0; width: 0; height: 0; }
.goal-toggle-slider {
  position: absolute; inset: 0; background: var(--bg-3);
  border-radius: 99px; cursor: pointer; transition: .2s;
  border: 1px solid var(--line);
}
.goal-toggle-slider::before {
  content: ''; position: absolute;
  width: 14px; height: 14px; left: 2px; top: 2px;
  background: white; border-radius: 50%; transition: .2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.goal-toggle input:checked + .goal-toggle-slider { background: var(--blue-2); border-color: var(--blue-2); }
.goal-toggle input:checked + .goal-toggle-slider::before { transform: translateX(14px); }

.goal-modal-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px;
  border-top: 1px solid var(--line);
}

.goal-reset-btn {
  font-size: 12.5px; color: var(--ink-3); cursor: pointer;
  font-family: var(--font-sans);
}
.goal-reset-btn:hover { color: var(--ink); text-decoration: underline; }

.goal-save-btn {
  padding: 8px 20px; border-radius: 8px; border: none;
  background: var(--blue-2); color: white;
  font-size: 13px; font-weight: 600; cursor: pointer;
  font-family: var(--font-sans); transition: opacity .15s;
}
.goal-save-btn:hover { opacity: 0.88; }

.ring-area {
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1;               /* 加这行 */
  margin-bottom: 16px;
}
.goal-list { display: flex; flex-direction: column; gap: 8px; }
.goal-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.goal-item-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.goal-label { color: var(--ink-2); font-size: 12px; }

.goal-val {
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: 11px;
}
.goal-val.done { color: var(--blue-2); font-weight: 600; }

.goal-progress-bar {
  height: 3px;
  background: var(--bg-3);
  border-radius: 99px;
  overflow: hidden;
}
.goal-progress-fill {
  height: 100%;
  border-radius: 99px;
  transition: width .4s ease;
}

/* 本周统计 */
.weekly-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  justify-content: space-between;  /* 加这行 */
}

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

/* 主题卡 */
.topic-card {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: 12px; padding: 16px 18px;
  cursor: pointer; transition: border-color .15s, box-shadow .15s;
}
.topic-card:hover { border-color: var(--blue-line); box-shadow: 0 2px 12px oklch(0.5 0.04 235 / 0.08); }
.tc-top { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.tc-emoji { width: 32px; height: 32px; border-radius: 9px; background: var(--bg-2); display: flex; align-items: center; justify-content: center; font-size: 15px; flex-shrink: 0; }
.tc-title { font-size: 13px; font-weight: 600; color: var(--ink); }
.tc-sub { font-size: 10.5px; color: var(--ink-3); font-family: var(--font-mono); margin-top: 1px; }
.tc-track { height: 4px; background: var(--bg-3); border-radius: 99px; margin-bottom: 8px; overflow: hidden; }
.tc-fill { height: 100%; border-radius: 99px; transition: width .4s; }
.tc-footer { display: flex; justify-content: space-between; font-size: 10.5px; color: var(--ink-3); font-family: var(--font-mono); }

/* 徽章 */
.badge-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; }
.badge { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 12px 8px; border-radius: 10px; cursor: pointer; transition: transform .15s; }
.badge:hover { transform: translateY(-2px); }
.badge.unlocked { background: var(--blue-tint); border: 0.5px solid var(--blue-line); }
.badge.locked { background: var(--bg-2); border: 0.5px dashed var(--line-2); opacity: 0.55; }
.badge-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; }
.badge.unlocked .badge-icon { background: var(--blue-soft); }
.badge.locked .badge-icon { background: var(--bg-3); }
.badge-name { font-size: 10px; font-weight: 500; text-align: center; color: var(--ink-2); line-height: 1.3; }
.badge.unlocked .badge-name { color: var(--blue-2); }

/* 时间线 */
.timeline { display: flex; flex-direction: column; }
.tl-item { display: flex; gap: 14px; padding: 10px 0; border-bottom: 0.5px solid var(--line); align-items: flex-start; }
.tl-item:last-child { border-bottom: none; }
.tl-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 5px; }
.tl-dot.mastered { background: var(--blue-2); }
.tl-dot.chat { background: #1D9E75; }
.tl-dot.start { background: #EF9F27; }
.tl-content { flex: 1; }
.tl-title { font-size: 12.5px; font-weight: 500; color: var(--ink); }
.tl-sub { font-size: 11px; color: var(--ink-3); margin-top: 2px; }
.tl-time { font-size: 10px; color: var(--ink-3); font-family: var(--font-mono); white-space: nowrap; }
</style>