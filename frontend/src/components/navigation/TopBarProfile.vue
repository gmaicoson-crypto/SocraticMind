<template>
  <button
    class="profile-wrap"
    type="button"
    :aria-label="`${username || '学习者'}的个人中心`"
    :title="`${username || '学习者'} · 个人中心`"
    @click="$emit('open')"
  >
    <span class="avatar" aria-hidden="true">
      <img
        :src="avatarSrc(avatarUrl || defaultUserAvatar)"
        alt=""
        class="avatar-img ui-avatar-image"
        decoding="async"
      />
    </span>
    <span class="profile-info">
      <span class="profile-name">{{ username || '学习者' }}</span>
      <span class="profile-level">LV {{ level }}</span>
    </span>
    <ChevronRight class="profile-chevron icon-inherit" :size="14" aria-hidden="true" />
  </button>
</template>

<script setup lang="ts">
import { ChevronRight } from '@lucide/vue'
import { avatarSrc } from '../../utils/avatar'
import { defaultUserAvatar } from '../../utils/avatarPresets'

defineProps<{
  username?: string
  avatarUrl?: string | null
  level: number
}>()
defineEmits<{ open: [] }>()
</script>

<style scoped>
.profile-wrap {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 10px;
  width: 180px;
  max-width: 180px;
  height: 48px;
  padding: 3px 10px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--profile-bg);
  color: var(--ink);
  font-family: var(--font-sans);
  text-align: left;
  cursor: pointer;
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast);
}
.profile-wrap:hover {
  border-color: var(--blue-line);
  background: var(--profile-hover-bg);
}
.profile-wrap:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 2px;
}
.profile-info {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}
.profile-name {
  display: block;
  max-width: 100%;
  overflow: hidden;
  color: var(--ink);
  font-size: 14px;
  font-weight: 600;
  line-height: 18px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.profile-level {
  padding: 0 5px;
  border: 1px solid var(--blue-line);
  border-radius: 5px;
  background: var(--blue-tint);
  color: var(--ink-2);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 15px;
  letter-spacing: 0.05em;
  white-space: nowrap;
}
.profile-chevron {
  color: var(--ink-3);
}
.profile-wrap:hover .profile-chevron {
  color: var(--ink-2);
}
.avatar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  overflow: hidden;
  border-radius: 10px;
  background: var(--bg-2);
  color: var(--on-accent);
  font-size: 13px;
  font-weight: 700;
}

@media (max-width: 1024px) {
  .profile-wrap {
    width: 160px;
  }
}

@media (max-width: 760px) {
  .profile-wrap {
    width: 152px;
    height: 44px;
    gap: 8px;
    border-radius: 10px;
  }

  .avatar {
    width: 36px;
    height: 36px;
    border-radius: 8px;
  }

  .profile-level {
    display: none;
  }
}

@media (max-width: 420px) {
  .profile-wrap {
    width: 44px;
    padding: 3px;
    gap: 0;
  }

  .profile-info,
  .profile-chevron {
    display: none;
  }
}
</style>
