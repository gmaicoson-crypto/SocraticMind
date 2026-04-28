<template>
  <aside class="sidebar">

    <!-- 我的主题 -->
    <div class="section">
      <div class="section-header">
        <span class="section-title">我的主题</span>
        <!-- 主题切换按钮 -->
        <button class="theme-btn" @click="store.toggleTheme" :title="store.isDark ? '切换到明亮' : '切换到黑暗'">
          <!-- 明亮模式图标：太阳 -->
          <svg v-if="store.isDark" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="12" cy="12" r="4"/>
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
          </svg>
          <!-- 黑暗模式图标：月亮 -->
          <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        </button>
      </div>

      <!-- 其余内容保持不变 -->
      <div class="topic-list">
        <button
          v-for="topic in store.topics"
          :key="topic.id"
          class="topic-row"
          :class="{ active: store.activeTopicId === topic.id }"
          @click="store.setActiveTopic(topic.id)"
        >
          <div class="topic-main">
            <span class="topic-emoji" :class="{ 'emoji-active': store.activeTopicId === topic.id }">
              {{ topic.emoji }}
            </span>
            <div class="topic-info">
              <div class="topic-title">{{ topic.title }}</div>
              <div class="topic-count">{{ topic.mastered }} / {{ topic.nodes }} 节点</div>
            </div>
          </div>
          <div class="prog-track">
            <div
              class="prog-fill"
              :class="{ 'fill-active': store.activeTopicId === topic.id }"
              :style="{ width: (topic.nodes ? topic.mastered / topic.nodes * 100 : 0) + '%' }"
            />
          </div>
        </button>
      </div>
    </div>

    <!-- 推荐 -->
    <div class="section">
      <div class="section-title" style="padding: 0 4px 8px;">推荐</div>
      <div class="recommend-list">
        <button
          v-for="r in recommends"
          :key="r.title"
          class="recommend-row"
        >
          <span class="rec-dot" />
          <div>
            <div class="rec-title">{{ r.title }}</div>
            <div class="rec-count">{{ r.count }} 节点</div>
          </div>
        </button>
      </div>
    </div>

    <!-- 连续学习 -->
    <div class="streak-card">
      <div class="streak-header">
        <span style="font-size: 18px;">✦</span>
        <span class="streak-label">连续学习</span>
      </div>
      <div class="streak-days">
        <span class="streak-num">14</span>
        <span class="streak-unit">天</span>
      </div>
      <div class="streak-bars">
        <div
          v-for="i in 7"
          :key="i"
          class="streak-bar"
          :style="{
            background: i < 7 ? 'var(--blue-2)' : 'var(--bg-3)',
            opacity: i < 7 ? 0.4 + i * 0.08 : 1,
          }"
        />
      </div>
    </div>

  </aside>
</template>

<script setup lang="ts">
import { useLearningStore } from '../stores/learning'

const store = useLearningStore()

const recommends = [
  { title: '概率与统计', count: 16 },
  { title: '数据可视化', count: 12 },
]
</script>

<style scoped>
.sidebar {
  width: 232px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 14px;
  background: var(--bg-2);
  border-right: 1px solid var(--line);
  overflow-y: auto;
  transition: background .3s, border-color .3s;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px 8px;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-3);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-family: var(--font-mono);
}

.theme-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-3);
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--ink-2);
  cursor: pointer;
  transition: all .15s;
}
.theme-btn:hover {
  background: var(--blue-tint);
  border-color: var(--blue-line);
  color: var(--blue-2);
}

.topic-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.topic-row {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  text-align: left;
  cursor: pointer;
  transition: background .15s;
  font-family: var(--font-sans);
}
.topic-row:hover { background: var(--bg-3); }
.topic-row.active {
  background: var(--blue-tint);
  border-color: var(--blue-line);
}

.topic-main {
  display: flex;
  align-items: center;
  gap: 9px;
}

.topic-emoji {
  width: 26px; height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-3);
  color: var(--ink-2);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  flex-shrink: 0;
  transition: background .15s;
}
.emoji-active {
  background: var(--blue-2);
  color: white;
}

.topic-info { flex: 1; min-width: 0; }

.topic-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.topic-count {
  font-size: 10.5px;
  color: var(--ink-3);
  font-family: var(--font-mono);
  margin-top: 1px;
}

.prog-track {
  height: 3px;
  background: var(--bg-3);
  border-radius: 999px;
  overflow: hidden;
}
.prog-fill {
  height: 100%;
  background: var(--blue);
  border-radius: 999px;
  transition: width .4s;
}
.fill-active { background: var(--blue-2); }

.recommend-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.recommend-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--surface);
  border: 1px dashed var(--line-2);
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  font-family: var(--font-sans);
  transition: background .15s;
}
.recommend-row:hover { background: var(--bg-3); }

.rec-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--blue);
  flex-shrink: 0;
}

.rec-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--ink);
}

.rec-count {
  font-size: 10.5px;
  color: var(--ink-3);
  font-family: var(--font-mono);
  margin-top: 1px;
}

.streak-card {
  margin-top: auto;
  padding: 12px;
  background: var(--blue-tint);
  border: 1px solid var(--blue-line);
  border-radius: 10px;
  transition: background .3s;
}

.streak-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.streak-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--blue-2);
}

.streak-days {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.streak-num {
  font-size: 22px;
  font-weight: 700;
  color: var(--ink);
}

.streak-unit {
  font-size: 11px;
  color: var(--ink-3);
}

.streak-bars {
  display: flex;
  gap: 3px;
  margin-top: 8px;
}

.streak-bar {
  flex: 1;
  height: 14px;
  border-radius: 3px;
  transition: background .3s;
}
</style>