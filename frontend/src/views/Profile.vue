<template>
  <div class="profile-page">
    <TopBar />
    <div class="profile-body">

      <!-- 个人信息 Hero -->
      <div class="hero-card">
        <div class="big-avatar">
          李
          <div class="level-badge">LV 4 · APPRENTICE</div>
        </div>
        <div class="hero-info">
          <div class="hero-name">李同学</div>
          <div class="hero-sig">「每一个问题都是通往掌握的一步」</div>
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
              <div class="stat-num">128</div>
              <div class="stat-label">对话轮次</div>
            </div>
            <div class="stat-div" />
            <div class="stat">
              <div class="stat-num">92%</div>
              <div class="stat-label">正确率</div>
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
          <div class="streak-chip">✦ 连续学习 14 天</div>
        </div>
      </div>

      <!-- 热力图 + 今日目标 -->
      <div class="grid-2">
        <!-- 热力图 -->
        <div class="card heatmap-card">
          <div class="card-title">学习热力图 · 近 8 周</div>
          <div class="heatmap">
            <div class="hm-day-labels">
              <span v-for="d in dayLabels" :key="d">{{ d }}</span>
            </div>
            <div class="hm-grid">
              <div
                v-for="(cell, i) in heatmapData"
                :key="i"
                class="hm-cell"
                :style="{ background: heatColor(cell) }"
                :title="`强度：${cell}`"
              />
            </div>
          </div>
          <div class="hm-legend">
            <span>少</span>
            <div v-for="c in heatColors" :key="c" class="hm-leg-cell" :style="{ background: c }" />
            <span>多</span>
          </div>
        </div>

        <!-- 今日目标 -->
        <div class="card">
          <div class="card-title">今日目标</div>
          <div class="ring-area">
            <svg width="100" height="100" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="38" fill="none" stroke="var(--bg-3)" stroke-width="10"/>
              <circle
                cx="50" cy="50" r="38"
                fill="none"
                stroke="var(--blue-2)"
                stroke-width="10"
                :stroke-dasharray="circumference"
                :stroke-dashoffset="dashOffset"
                stroke-linecap="round"
                transform="rotate(-90 50 50)"
              />
              <text x="50" y="47" text-anchor="middle" font-size="18" font-weight="700" fill="var(--ink)" font-family="monospace">{{ todayPct }}%</text>
              <text x="50" y="61" text-anchor="middle" font-size="9" fill="var(--ink-3)">{{ todayDone }}/{{ todayTotal }} 节点</text>
            </svg>
          </div>
          <div class="goal-list">
            <div v-for="goal in goals" :key="goal.label" class="goal-item">
              <span class="goal-label">{{ goal.label }}</span>
              <span class="goal-val" :class="{ done: goal.done }">
                {{ goal.done ? '✓ 完成' : goal.val }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 主题进度 -->
      <div>
        <div class="section-title">学习主题进度</div>
        <div class="grid-3">
          <div
            v-for="topic in store.topics"
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
                  background: topicColor(topic.id),
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
            v-for="badge in badges"
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
          <div v-for="r in records" :key="r.title" class="tl-item">
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
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useLearningStore } from '../stores/learning'
import TopBar from '../components/TopBar.vue'
import EditProfileModal from '../components/EditProfileModal.vue'

const showEditModal = ref(false)
const store = useLearningStore()
const router = useRouter()

// 热力图
const dayLabels = ['日', '一', '二', '三', '四', '五', '六']
const heatColors = ['#EBE6DF', '#B5D4F4', '#5BA3D9', '#2E7FBB', '#0C447C']

const heatmapData = Array.from({ length: 56 }, (_, i) => {
  const v = Math.random()
  const col = Math.floor(i / 7)
  return col > 4 ? Math.min(Math.floor(v * 5) + 1, 4) : Math.floor(v * 5)
})

function heatColor(val: number) {
  return heatColors[Math.min(val, 4)]
}

// 今日目标
const circumference = 2 * Math.PI * 38
const todayDone = 3
const todayTotal = 5
const todayPct = computed(() => Math.round(todayDone / todayTotal * 100))
const dashOffset = computed(() => circumference - (todayPct.value / 100) * circumference)

const goals = [
  { label: '完成对话 5 轮', done: true, val: '' },
  { label: '掌握 3 个节点', done: true, val: '' },
  { label: '记录笔记', done: false, val: '0 / 1' },
]

// 主题颜色
function topicColor(id: string) {
  const map: Record<string, string> = {
    py: '#2E7FBB',
    math: '#1D9E75',
    ml: '#BA7517',
    alg: '#993556',
  }
  return map[id] || '#2E7FBB'
}

// 成就徽章
const badges = [
  { icon: '🚀', name: '第一步', unlocked: true },
  { icon: '🔥', name: '连续7天', unlocked: true },
  { icon: '⭐', name: '掌握10节点', unlocked: true },
  { icon: '🐍', name: 'Python新手', unlocked: true },
  { icon: '💬', name: '对话达人', unlocked: true },
  { icon: '📝', name: '笔记控', unlocked: true },
  { icon: '🏆', name: '掌握50节点', unlocked: false },
  { icon: '🌙', name: '连续30天', unlocked: false },
  { icon: '🧮', name: '数学探索者', unlocked: false },
  { icon: '🤖', name: 'ML入门', unlocked: false },
  { icon: '💎', name: '全图通关', unlocked: false },
  { icon: '👑', name: '学习大师', unlocked: false },
]

// 时间线
const records = [
  { type: 'mastered', title: '掌握「条件语句」节点', sub: 'Python 基础 · 完成苏格拉底对话', time: '10分钟前' },
  { type: 'chat',     title: '完成 5 轮 AI 对话',   sub: '探讨 if...elif...else 的使用场景',  time: '32分钟前' },
  { type: 'mastered', title: '掌握「比较运算」节点', sub: 'Python 基础',                       time: '1小时前' },
  { type: 'chat',     title: '记录 Markdown 笔记',   sub: '条件语句 · 关键观察与代码示例',     time: '2小时前' },
  { type: 'start',    title: '开始学习「Python 基础」', sub: '新主题解锁，共 11 个知识节点',   time: '昨天 14:20' },
]
</script>

<style scoped>
.profile-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--bg);
}

.profile-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 28px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Hero */
.hero-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 24px 28px;
  display: flex;
  align-items: center;
  gap: 24px;
}

.big-avatar {
  width: 72px; height: 72px;
  border-radius: 18px;
  background: linear-gradient(135deg, oklch(0.85 0.06 60), oklch(0.7 0.10 35));
  color: white;
  font-size: 26px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
}

.level-badge {
  position: absolute;
  bottom: -10px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--blue-2);
  color: white;
  font-size: 9px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 99px;
  white-space: nowrap;
  font-family: var(--font-mono);
  letter-spacing: 0.04em;
  border: 2px solid var(--surface);
}

.hero-info { flex: 1; }

.hero-name {
  font-size: 20px;
  font-weight: 700;
  color: var(--ink);
  letter-spacing: -0.01em;
}

.hero-sig {
  font-size: 12.5px;
  color: var(--ink-2);
  margin-top: 3px;
  margin-bottom: 16px;
}

.stat-row {
  display: flex;
  gap: 20px;
  align-items: center;
}

.stat { text-align: center; }

.stat-num {
  font-size: 20px;
  font-weight: 700;
  color: var(--ink);
  font-family: var(--font-mono);
}

.stat-label {
  font-size: 10px;
  color: var(--ink-3);
  margin-top: 1px;
}

.stat-div {
  width: 0.5px;
  height: 32px;
  background: var(--line);
}

.hero-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.edit-btn, .back-btn{
  padding: 7px 16px;
  border-radius: 8px;
  border: 2px solid var(--line);
  background: var(--surface);
  font-size: 12px;
  font-weight: 500;
  color: var(--ink-2);
  cursor: pointer;
  font-family: var(--font-sans);
  transition: background .15s;
}
.edit-btn:hover, .back-btn:hover { background: var(--bg-2); }

.streak-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  background: var(--blue-tint);
  border: 0.5px solid var(--blue-line);
  border-radius: 99px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--blue-2);
}

/* Grid */
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.grid-3 {
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
}

.card-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-3);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  font-family: var(--font-mono);
  margin-bottom: 14px;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-3);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  font-family: var(--font-mono);
  margin-bottom: 10px;
}

/* 热力图 */
.heatmap-card {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.heatmap-card .card-title {
  width: 100%;
  flex-shrink: 0;
}

.heatmap {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: fit-content;
}

.hm-day-labels {
  display: flex;
  gap: 3px;
}

.hm-day-labels span {
  width: 14px;
  font-size: 8px;
  color: var(--ink-3);
  text-align: center;
  font-family: var(--font-mono);
}

.hm-grid {
  display: grid;
  grid-template-columns: repeat(7, 14px);
  grid-template-rows: repeat(8, 14px);
  grid-auto-flow: column;
  gap: 3px;
  width: fit-content;
}

.hm-cell {
  width: 14px;
  height: 14px;
  border-radius: 2px;
  transition: transform .1s;
}
.hm-cell:hover { transform: scale(1.15); }

.hm-legend {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  font-size: 10px;
  color: var(--ink-3);
}

.hm-leg-cell {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

/* 环形图 */
.ring-area {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
}

.goal-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.goal-item {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}

.goal-label { color: var(--ink-2); }

.goal-val { color: var(--ink-3); font-family: var(--font-mono); }
.goal-val.done { color: var(--blue-2); font-weight: 600; }

/* 主题卡 */
.topic-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 16px 18px;
  cursor: pointer;
  transition: border-color .15s, box-shadow .15s;
}
.topic-card:hover {
  border-color: var(--blue-line);
  box-shadow: 0 2px 12px oklch(0.5 0.04 235 / 0.08);
}

.tc-top {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.tc-emoji {
  width: 32px; height: 32px;
  border-radius: 9px;
  background: var(--bg-2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  flex-shrink: 0;
}

.tc-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
}

.tc-sub {
  font-size: 10.5px;
  color: var(--ink-3);
  font-family: var(--font-mono);
  margin-top: 1px;
}

.tc-track {
  height: 4px;
  background: var(--bg-3);
  border-radius: 99px;
  margin-bottom: 8px;
  overflow: hidden;
}

.tc-fill {
  height: 100%;
  border-radius: 99px;
  transition: width .4s;
}

.tc-footer {
  display: flex;
  justify-content: space-between;
  font-size: 10.5px;
  color: var(--ink-3);
  font-family: var(--font-mono);
}

/* 徽章 */
.badge-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 10px;
}

.badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 12px 8px;
  border-radius: 10px;
  cursor: pointer;
  transition: transform .15s;
}
.badge:hover { transform: translateY(-2px); }

.badge.unlocked {
  background: var(--blue-tint);
  border: 0.5px solid var(--blue-line);
}

.badge.locked {
  background: var(--bg-2);
  border: 0.5px dashed var(--line-2);
  opacity: 0.55;
}

.badge-icon {
  width: 36px; height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}

.badge.unlocked .badge-icon { background: var(--blue-soft); }
.badge.locked .badge-icon { background: var(--bg-3); }

.badge-name {
  font-size: 10px;
  font-weight: 500;
  text-align: center;
  color: var(--ink-2);
  line-height: 1.3;
}
.badge.unlocked .badge-name { color: var(--blue-2); }

/* 时间线 */
.timeline { display: flex; flex-direction: column; }

.tl-item {
  display: flex;
  gap: 14px;
  padding: 10px 0;
  border-bottom: 0.5px solid var(--line);
  align-items: flex-start;
}
.tl-item:last-child { border-bottom: none; }

.tl-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 5px;
}
.tl-dot.mastered { background: var(--blue-2); }
.tl-dot.chat { background: #1D9E75; }
.tl-dot.start { background: #EF9F27; }

.tl-content { flex: 1; }

.tl-title {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--ink);
}

.tl-sub {
  font-size: 11px;
  color: var(--ink-3);
  margin-top: 2px;
}

.tl-time {
  font-size: 10px;
  color: var(--ink-3);
  font-family: var(--font-mono);
  white-space: nowrap;
}
</style>