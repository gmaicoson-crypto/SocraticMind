<template>
  <div class="notes-wrap">
    <div class="notes-header">
      <div class="tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="tab-btn"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          <component :is="tab.icon" :size="13" aria-hidden="true" />
          {{ tab.label }}
        </button>
      </div>
    </div>

    <div class="notes-body">
      <MarkdownEditor v-if="activeTab === 'md'" />
      <CanvasSketch v-else />
    </div>
  </div>
</template>

<script setup lang="ts">
// NotesPanel 组件，封装局部界面和交互逻辑。
import { ref, defineAsyncComponent, type Component } from 'vue'
import { AlignLeft, PenTool } from '@lucide/vue'

const MarkdownEditor = defineAsyncComponent(() => import('./notes/MarkdownEditor.vue'))
const CanvasSketch = defineAsyncComponent(() => import('./notes/CanvasSketch.vue'))

const activeTab = ref<'md' | 'canvas'>('md')

const tabs: Array<{ key: 'md' | 'canvas'; label: string; icon: Component }> = [
  { key: 'md', label: 'Markdown 笔记', icon: AlignLeft },
  { key: 'canvas', label: '画布草图', icon: PenTool },
]
</script>

<style scoped>
.notes-wrap {
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
  min-height: 0;
}

.notes-header {
  padding: 10px 14px;
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--header-gradient);
  flex-shrink: 0;
  gap: 8px;
}

.tabs {
  display: flex;
  gap: 2px;
}

.tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 11px;
  font-size: 12px;
  font-weight: 500;
  background: transparent;
  color: var(--ink-2);
  border: 1px solid transparent;
  border-radius: 7px;
  cursor: pointer;
  font-family: var(--font-sans);
  transition: all 0.15s;
}

.tab-btn:hover {
  background: var(--bg-2);
}

.tab-btn.active {
  background: var(--blue-tint);
  color: var(--blue-2);
  border-color: var(--blue-line);
}

.notes-body {
  flex: 1;
  padding: 12px;
  min-height: 0;
  overflow: hidden;
}
</style>
