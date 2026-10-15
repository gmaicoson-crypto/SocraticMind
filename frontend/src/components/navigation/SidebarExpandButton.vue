<template>
  <div v-if="uiStore.sidebarCollapsed" class="sidebar-reveal-zone">
    <IconButton class="collapsed-toggle" label="展开侧边栏" @click="uiStore.toggleSidebar">
      <ChevronRight :size="22" aria-hidden="true" />
    </IconButton>
  </div>
</template>

<script setup lang="ts">
import { ChevronRight } from '@lucide/vue'
import { useUiStore } from '../../stores/ui'
import IconButton from '../ui/IconButton.vue'

const uiStore = useUiStore()
</script>

<style scoped>
.sidebar-reveal-zone {
  position: absolute;
  inset-block: 0;
  left: 0;
  z-index: 5;
  width: 12px;
}

.collapsed-toggle {
  --icon-button-bg: color-mix(in srgb, var(--bg-3) 35%, transparent);
  --icon-button-border: color-mix(in srgb, var(--line) 50%, transparent);
  --icon-button-hover-bg: color-mix(in srgb, var(--bg-3) 50%, transparent);
  --icon-button-hover-border: color-mix(in srgb, var(--line) 70%, transparent);
  position: absolute;
  top: 50%;
  left: 0;
  width: 30px;
  height: 60px;
  transform: translateY(-50%);
  opacity: 0;
  pointer-events: none;
  transition:
    opacity var(--transition-fast),
    background var(--transition-fast),
    border-color var(--transition-fast),
    color var(--transition-fast);
}

.sidebar-reveal-zone:hover .collapsed-toggle,
.sidebar-reveal-zone:focus-within .collapsed-toggle {
  opacity: 1;
  pointer-events: auto;
}

@media (max-width: 760px) {
  .sidebar-reveal-zone {
    display: none;
  }
}
</style>
