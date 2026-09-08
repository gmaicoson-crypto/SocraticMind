<template>
  <BaseCard class="profile-section-card">
    <header class="profile-section-card__header">
      <h2 class="profile-section-card__title">{{ title }}</h2>
      <slot name="action" />
    </header>
    <slot />
  </BaseCard>
</template>

<script setup lang="ts">
import BaseCard from '../ui/BaseCard.vue'

defineProps<{ title: string }>()
</script>

<style scoped>
.profile-section-card {
  display: flex;
  flex-direction: column;
  padding: 18px 20px;
}
.profile-section-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.profile-section-card__title {
  margin: 0;
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}
@media (max-width: 500px) {
  .profile-section-card {
    min-width: 0;
    padding: 14px;
  }
  .profile-section-card__header {
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 10px;
  }
}
</style>
