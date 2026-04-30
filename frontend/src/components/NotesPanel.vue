<template>
  <div class="notes-wrap">

    <!-- Header -->
    <div class="notes-header">
      <div class="notes-header-left">
        <span class="notes-title">笔记与画布</span>
        <div class="tabs">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            class="tab-btn"
            :class="{ active: activeTab === tab.key }"
            @click="activeTab = tab.key"
          >
            <component :is="tab.icon" />
            {{ tab.label }}
          </button>
        </div>
      </div>
      <button
        class="master-btn"
        :class="{ enabled: canMaster && !isMastering }"
        :disabled="!canMaster || isMastering"
        @click="handleMaster"
      >
        <svg v-if="!isMastering" width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
          <path d="M3 8 L7 12 L13 4"/>
        </svg>
        <span v-else class="spinner" />
        {{ isMastering ? '保存中…' : '标记为已掌握' }}
      </button>
    </div>

    <!-- Body -->
    <div class="notes-body">
      <MarkdownEditor v-if="activeTab === 'md'" />
      <CanvasSketch v-else />
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, h } from 'vue'
import { useLearningStore } from '../stores/learning'
import MarkdownEditor from './MarkdownEditor.vue'
import CanvasSketch from './CanvasSketch.vue'

const store = useLearningStore()
const activeTab = ref<'md' | 'canvas'>('md')

const canMaster = computed(() =>
  !!store.activeNode && store.activeNode.state === 'available'
)
const isMastering = ref(false)

async function handleMaster() {
  if (!store.activeNode || isMastering.value) return
  isMastering.value = true
  const currentTopicIdSnapshot = store.activeTopicId
  try {
    await store.masterNode(store.activeNode.id)
    store.setActiveNode({ ...store.activeNode, state: 'mastered' })
    await store.fetchTopicsOnly()
    await store.fetchNodes(Number(currentTopicIdSnapshot))
  } catch (err) {
    console.error('标记失败', err)
  } finally {
    isMastering.value = false
  }
}

const IconMd = () => h('svg', {
  width: 13, height: 13, viewBox: '0 0 24 24',
  fill: 'none', stroke: 'currentColor',
  'stroke-width': 2,
}, [
  h('path', { d: 'M4 6H20M4 12H20M4 18H14' })
])

const IconCanvas = () => h('svg', {
  width: 13, height: 13, viewBox: '0 0 24 24',
  fill: 'none', stroke: 'currentColor',
  'stroke-width': 2,
}, [
  h('path', { d: 'M3 17L9 11L13 15L21 7' })
])

const tabs: Array<{ key: 'md' | 'canvas', label: string, icon: any }> = [
  { key: 'md', label: 'Markdown 笔记', icon: IconMd },
  { key: 'canvas', label: '画布草图', icon: IconCanvas },
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
  background: linear-gradient(180deg, var(--bg-2), var(--surface));
  flex-shrink: 0;
  gap: 8px;
}

.notes-header-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.notes-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink);
  white-space: nowrap;
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
  transition: all .15s;
}

.tab-btn:hover {
  background: var(--bg-2);
}

.tab-btn.active {
  background: var(--blue-tint);
  color: var(--blue-2);
  border-color: var(--blue-line);
}

.master-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 11px;
  font-size: 11.5px;
  font-weight: 600;
  background: var(--bg-3);
  color: var(--ink-3);
  border: none;
  border-radius: 7px;
  cursor: not-allowed;
  font-family: var(--font-sans);
  transition: all .15s;
  white-space: nowrap;
  flex-shrink: 0;
}

.master-btn.enabled {
  background: var(--blue-2);
  color: white;
  cursor: pointer;
}

.master-btn.enabled:hover { opacity: 0.85; }

.notes-body {
  flex: 1;
  padding: 12px;
  min-height: 0;
  overflow: hidden;
}

.spinner {
  width: 11px; height: 11px;
  border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.4);
  border-top-color: white;
  animation: spin .7s linear infinite;
  display: inline-block;
}

@keyframes spin { to { transform: rotate(360deg); } }
</style>