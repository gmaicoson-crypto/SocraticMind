<template>
  <button class="profile-wrap" type="button" @click="$emit('open')">
    <span class="profile-info">
      <span class="profile-name">{{ username || '学习者' }}</span>
      <span class="profile-level">LV {{ level }}</span>
    </span>
    <span class="avatar" :style="avatarUrl ? {} : { background: avatarGrad }">
      <img
        v-if="avatarUrl"
        :src="avatarSrc(avatarUrl)"
        alt="avatar"
        class="avatar-img ui-avatar-image"
        decoding="async"
      />
      <template v-else>{{ username?.slice(0, 1) || '学' }}</template>
    </span>
  </button>
</template>

<script setup lang="ts">
import { avatarSrc } from '../../utils/avatar'

defineProps<{
  username?: string
  avatarUrl?: string | null
  avatarGrad?: string
  level: number
}>()
defineEmits<{ open: [] }>()
</script>

<style scoped>
.profile-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 8px;
  border: none;
  border-radius: 10px;
  background: var(--profile-bg);
  font-family: var(--font-sans);
  cursor: pointer;
  transition: background 0.15s;
}
.profile-wrap:hover {
  background: var(--profile-hover-bg);
}
.profile-info {
  display: flex;
  flex-direction: column;
  text-align: right;
}
.profile-name {
  color: var(--ink);
  font-size: 12.5px;
  font-weight: 600;
}
.profile-level {
  margin-top: 1px;
  color: var(--blue-2);
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.05em;
}
.avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  overflow: hidden;
  border-radius: 10px;
  background: var(--avatar-bg);
  color: var(--on-accent);
  font-size: 13px;
  font-weight: 700;
}
</style>
