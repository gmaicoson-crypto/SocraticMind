<template>
  <div class="profile-page">
    <TopBar />
    <div class="profile-body">
      <ProfileHero
        :user-info="store.userInfo"
        :user-name="userName"
        :user-bio="userBio"
        :mastered-count="stats.mastered_count"
        :topic-count="store.topics.length"
        :chat-count="stats.chat_count"
        :streak="stats.streak"
        @back="router.push('/')"
        @edit="showEditModal = true"
      />

      <div class="grid-3col">
        <HeatmapCard :heatmap="stats.heatmap" :today-str="todayStr" />
        <GoalsCard
          :user-id="store.userInfo?.id"
          :today-chat-count="todayChatCount"
          :mastered-count="stats.mastered_count"
          :today-study-minutes="todayStudyMinutes"
          :topics="store.topics"
        />
        <WeeklyCard :weekly="stats.weekly" :heatmap="stats.heatmap" :today-str="todayStr" />
      </div>

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
                  width: (topic.nodes ? (topic.mastered / topic.nodes) * 100 : 0) + '%',
                  background: topicColor(idx),
                }"
              />
            </div>
            <div class="tc-footer">
              <span>{{ topic.mastered }} / {{ topic.nodes }} 已掌握</span>
              <span>{{ Math.round((topic.mastered / topic.nodes) * 100) || 0 }}%</span>
            </div>
          </div>
        </div>
      </div>

      <AgentMemorySection />

      <div class="card ui-card">
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

      <div class="card ui-card">
        <div class="card-title">最近记录</div>
        <div class="timeline">
          <div
            v-if="stats.timeline.length === 0"
            style="color: var(--ink-3); font-size: 13px; padding: 12px 0"
          >
            还没有学习记录，开始学习吧！
          </div>
          <div v-for="r in stats.timeline" :key="r.title + r.time" class="tl-item">
            <div class="tl-dot" :class="r.type" />
            <div class="tl-content">
              <div class="tl-title">{{ r.title }}</div>
              <div class="tl-sub">{{ r.sub }}</div>
            </div>
            <TimeDisplay class="tl-time" :value="r.occurred_at ?? r.time" />
          </div>
        </div>
      </div>
    </div>
  </div>
  <EditProfileModal v-if="showEditModal" @close="showEditModal = false" />
</template>

<script setup lang="ts">
// Profile 页面组件，承载对应页面的主要交互。
import { ref, shallowRef, computed, onMounted, defineAsyncComponent } from 'vue'
import { useRouter } from 'vue-router'
import { useLearningStore } from '../stores/learning'
import TopBar from '../components/TopBar.vue'
import TimeDisplay from '../components/ui/TimeDisplay.vue'

const EditProfileModal = defineAsyncComponent(
  () => import('../components/profile/EditProfileModal.vue'),
)
const AgentMemorySection = defineAsyncComponent(
  () => import('../components/profile/AgentMemorySection.vue'),
)
import { getProfileStats } from '../api/progress'
import { loadTodayProgress } from '../utils/dailyGoal'
import type { ProfileStats } from '../api/progress'

import ProfileHero from './profile/ProfileHero.vue'
import HeatmapCard from './profile/HeatmapCard.vue'
import GoalsCard from './profile/GoalsCard.vue'
import WeeklyCard from './profile/WeeklyCard.vue'

const showEditModal = ref(false)
const store = useLearningStore()
const router = useRouter()

const stats = shallowRef<ProfileStats>({
  chat_count: 0,
  mastered_count: 0,
  streak: 0,
  total_days: 0,
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
  await store.recordLearning()
  try {
    stats.value = await getProfileStats()
  } catch (err) {
    console.error('加载统计数据失败', err)
  }
})

const userName = computed(() => store.userInfo?.username ?? '学习者')
const userBio = computed(() => store.userInfo?.bio ?? '每一个问题都是通往掌握的一步')

const todayStr = new Date().toISOString().slice(0, 10)

const todayChatCount = computed(() => {
  const cell = stats.value.heatmap.find((h) => h.date === todayStr)
  return cell?.count ?? 0
})

const todayStudyMinutes = computed(() => {
  if (!store.userInfo?.id) return 0
  return loadTodayProgress(store.userInfo.id).study_minutes
})

const topicColors = [
  'var(--topic-color-1)',
  'var(--topic-color-2)',
  'var(--topic-color-3)',
  'var(--topic-color-4)',
  'var(--topic-color-5)',
  'var(--topic-color-6)',
]
function topicColor(index: number) {
  return topicColors[index % topicColors.length]
}
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

.grid-3col {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 16px;
  align-items: stretch;
}

.grid-topics {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
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

.card {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
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

.topic-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 16px 18px;
  cursor: pointer;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.topic-card:hover {
  border-color: var(--blue-line);
  box-shadow: var(--shadow-card);
}
.tc-top {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.tc-emoji {
  width: 32px;
  height: 32px;
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
  transition: width 0.4s;
}
.tc-footer {
  display: flex;
  justify-content: space-between;
  font-size: 10.5px;
  color: var(--ink-3);
  font-family: var(--font-mono);
}

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
  transition: transform 0.15s;
}
.badge:hover {
  transform: translateY(-2px);
}
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
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}
.badge.unlocked .badge-icon {
  background: var(--blue-soft);
}
.badge.locked .badge-icon {
  background: var(--bg-3);
}
.badge-name {
  font-size: 10px;
  font-weight: 500;
  text-align: center;
  color: var(--ink-2);
  line-height: 1.3;
}
.badge.unlocked .badge-name {
  color: var(--blue-2);
}

.timeline {
  display: flex;
  flex-direction: column;
}
.tl-item {
  display: flex;
  gap: 14px;
  padding: 10px 0;
  border-bottom: 0.5px solid var(--line);
  align-items: flex-start;
}
.tl-item:last-child {
  border-bottom: none;
}
.tl-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 5px;
}
.tl-dot.mastered {
  background: var(--blue-2);
}
.tl-dot.chat {
  background: var(--timeline-chat);
}
.tl-dot.start {
  background: var(--timeline-start);
}
.tl-content {
  flex: 1;
}
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
@media (max-width: 760px) {
  .profile-body {
    min-width: 0;
    padding: 12px;
    gap: 12px;
  }
  .grid-3col,
  .grid-topics {
    grid-template-columns: minmax(0, 1fr);
  }
  .card,
  .topic-card {
    min-width: 0;
    padding: 14px;
  }
  .tc-title,
  .tl-title,
  .tl-sub {
    overflow-wrap: anywhere;
  }
  .badge-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .tl-item {
    gap: 9px;
  }
}
</style>
