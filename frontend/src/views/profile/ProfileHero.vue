<template>
  <div class="hero-card">
    <div class="big-avatar" :style="userInfo?.avatar_url ? {} : { background: userInfo?.avatar_grad }">
      <img v-if="userInfo?.avatar_url" :src="avatarSrc(userInfo.avatar_url)" alt="avatar" class="big-avatar-img" decoding="async" />
      <template v-else>{{ userName.slice(0, 1) }}</template>
    </div>
    <div class="hero-info">
      <div class="hero-name">{{ userName }}</div>
      <div class="hero-sig">「{{ userBio }}」</div>
      <div class="stat-row">
        <div class="stat">
          <div class="stat-num">{{ masteredCount }}</div>
          <div class="stat-label">已掌握节点</div>
        </div>
        <div class="stat-div" />
        <div class="stat">
          <div class="stat-num">{{ topicCount }}</div>
          <div class="stat-label">学习主题</div>
        </div>
        <div class="stat-div" />
        <div class="stat">
          <div class="stat-num">{{ chatCount }}</div>
          <div class="stat-label">对话轮次</div>
        </div>
        <div class="stat-div" />
        <div class="stat">
          <div class="stat-num">{{ streak }}</div>
          <div class="stat-label">连续天数</div>
        </div>
      </div>
    </div>
    <div class="hero-actions">
      <button class="back-btn" @click="$emit('back')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M19 12H5M12 5l-7 7 7 7"/>
        </svg>
        返回对话
      </button>
      <button class="edit-btn" @click="$emit('edit')">编辑资料</button>
      <div class="streak-chip">✦ 连续学习 {{ streak }} 天</div>
    </div>
  </div>
</template>

<script setup lang="ts">
// ProfileHero 页面组件，承载对应页面的主要交互。
import { avatarSrc } from '../../utils/avatar'

defineProps<{
  userInfo: {
    avatar_url: string | null
    avatar_grad: string
  } | null
  userName: string
  userBio: string
  masteredCount: number
  topicCount: number
  chatCount: number
  streak: number
}>()

defineEmits<{
  (e: 'back'): void
  (e: 'edit'): void
}>()
</script>

<style scoped>
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
  width: 72px;
  height: 72px;
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
  overflow: hidden;
}
.big-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.hero-info {
  flex: 1;
}
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
.stat {
  text-align: center;
}
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
.edit-btn, .back-btn {
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
.edit-btn:hover, .back-btn:hover {
  background: var(--bg-2);
}
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
</style>
