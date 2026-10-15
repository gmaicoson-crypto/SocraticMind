<template>
  <div class="mastery-dock" :class="{ 'is-collapsed': collapsed }">
    <div class="mastery-panel-track">
      <div class="mastery-panel" :aria-hidden="collapsed" :inert="collapsed">
        <section class="mastery-tool">
          <div class="mastery-copy">
            <div>
              <p>当前知识节点</p>
              <h3>{{ node.label }}</h3>
            </div>
            <div class="mastery-heading-actions">
              <span :class="['state-badge', node.state]">{{ stateLabel }}</span>
              <button
                ref="collapseButtonRef"
                type="button"
                class="mastery-collapse"
                title="收起当前知识节点卡片"
                aria-label="收起当前知识节点卡片"
                :aria-expanded="!collapsed"
                @click="collapsePanel"
              >
                <ChevronDown :size="14" class="icon-inherit" aria-hidden="true" />
              </button>
            </div>
          </div>
          <p v-if="node.sub" class="node-sub">{{ node.sub }}</p>

          <div v-if="node.state === 'mastered'" class="mastery-evidence">
            <span>掌握来源</span>
            <strong>{{ sourceLabel }}</strong>
            <span v-if="node.masteryConfidence != null"
              >置信度 {{ Math.round(node.masteryConfidence * 100) }}%</span
            >
          </div>
          <p v-else-if="node.state === 'locked'" class="locked-notice">
            完成先修节点后即可评估或自报掌握。
          </p>
          <p v-if="error" class="mastery-error">{{ error }}</p>

          <div class="mastery-actions">
            <template v-if="node.state === 'mastered'">
              <BaseButton :disabled="busy" @click="emit('revert')">撤销掌握</BaseButton>
            </template>
            <template v-else>
              <BaseButton :disabled="busy || node.state === 'locked'" @click="emit('selfReport')"
                >自报掌握</BaseButton
              >
              <BaseButton
                class="primary"
                :disabled="busy || node.state === 'locked'"
                @click="emit('assess')"
                >开始评估</BaseButton
              >
            </template>
          </div>
        </section>
      </div>
    </div>
    <div v-if="collapsed" class="mastery-boundary">
      <button
        ref="expandButtonRef"
        type="button"
        class="mastery-expand"
        title="展开当前知识节点卡片"
        aria-label="展开当前知识节点卡片"
        :aria-expanded="!collapsed"
        @click="expandPanel"
      >
        <ChevronUp :size="14" class="icon-inherit" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ChevronDown, ChevronUp } from '@lucide/vue'
import type { KNode } from '../../types'
import BaseButton from '../ui/BaseButton.vue'

const props = withDefaults(defineProps<{ node: KNode; busy?: boolean; error?: string }>(), {
  busy: false,
  error: '',
})
const emit = defineEmits<{ assess: []; selfReport: []; revert: [] }>()
const collapsed = ref(false)
const collapseButtonRef = ref<HTMLButtonElement | null>(null)
const expandButtonRef = ref<HTMLButtonElement | null>(null)

function collapsePanel(event: MouseEvent) {
  if (event.detail !== 0) collapseButtonRef.value?.blur()
  collapsed.value = true
  if (event.detail === 0) nextTick(() => expandButtonRef.value?.focus())
}

function expandPanel(event: MouseEvent) {
  collapsed.value = false
  if (event.detail === 0) nextTick(() => collapseButtonRef.value?.focus())
}

watch(
  () => props.node.id,
  () => (collapsed.value = false),
)
const stateLabel = computed(
  () => ({ available: '可学习', locked: '未解锁', mastered: '已掌握' })[props.node.state],
)
const sourceLabel = computed(
  () =>
    ({
      assessment: '评估通过',
      self_reported: '用户自报',
      legacy: '历史记录',
    })[props.node.masterySource ?? 'legacy'],
)
</script>

<style scoped>
.mastery-dock {
  flex-shrink: 0;
  background: transparent;
  pointer-events: none;
}
.mastery-panel-track {
  display: grid;
  grid-template-rows: 1fr;
  transition: grid-template-rows 0.22s ease;
}
.mastery-dock.is-collapsed .mastery-panel-track {
  grid-template-rows: 0fr;
}
.mastery-panel {
  display: flex;
  min-height: 0;
  justify-content: center;
  overflow: hidden;
}
.mastery-tool {
  display: grid;
  flex: 0 1 680px;
  gap: 8px;
  min-width: 0;
  max-height: min(360px, 45vh);
  margin: 8px 14px 10px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: var(--control-shadow);
  color: var(--ink);
  overflow-y: auto;
  pointer-events: auto;
}
.mastery-heading-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
}
.mastery-collapse {
  display: inline-flex;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: var(--ink-3);
  cursor: pointer;
}
.mastery-collapse:hover,
.mastery-collapse:focus-visible {
  border-color: var(--line);
  background: var(--bg-2);
  color: var(--ink);
}
.mastery-boundary {
  position: relative;
  width: 96px;
  height: 16px;
  margin-inline: auto;
  pointer-events: auto;
}
.mastery-expand {
  position: absolute;
  bottom: 0;
  left: 50%;
  z-index: 11;
  display: inline-flex;
  width: 32px;
  height: 24px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 6px 6px 0 0;
  background: var(--surface);
  box-shadow: var(--control-shadow);
  color: var(--ink-2);
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, 8px);
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}
.mastery-boundary:hover .mastery-expand,
.mastery-boundary:focus-within .mastery-expand {
  opacity: 1;
  pointer-events: auto;
  transform: translate(-50%, -8px);
}
.mastery-expand:focus-visible {
  outline: 2px solid var(--blue-2);
  outline-offset: 2px;
}
@media (hover: none) {
  .mastery-expand {
    opacity: 1;
    pointer-events: auto;
    transform: translate(-50%, -8px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .mastery-panel-track,
  .mastery-expand {
    transition: none;
  }
}
.mastery-copy {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.mastery-copy p {
  margin: 0 0 3px;
  color: var(--blue-2);
  font-size: 9.5px;
  font-weight: 700;
}
.mastery-copy h3 {
  margin: 0;
  font-size: 14px;
  overflow-wrap: anywhere;
}
.node-sub,
.locked-notice {
  margin: 0;
  color: var(--ink-3);
  font-size: 11px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
.mastery-error {
  margin: 0;
  color: var(--danger-strong);
  font-size: 11px;
  overflow-wrap: anywhere;
}
.state-badge {
  display: inline-flex;
  flex: 0 0 auto;
  min-height: 24px;
  align-items: center;
  padding: 3px 6px;
  border-radius: 5px;
  background: var(--bg-2);
  color: var(--ink-2);
  font-size: 13px;
  font-weight: 600;
  line-height: 18px;
  white-space: nowrap;
}
.state-badge.available {
  background: var(--blue-tint);
  color: var(--blue-2);
}
.state-badge.mastered {
  background: var(--success-muted-bg);
  color: var(--success-strong);
}
.mastery-evidence {
  display: flex;
  flex-wrap: wrap;
  gap: 7px 12px;
  color: var(--ink-3);
  font-size: 10.5px;
}
.mastery-evidence strong {
  color: var(--ink-2);
}
.mastery-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.mastery-actions :deep(.ui-button) {
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--bg-2);
  color: var(--ink-2);
  cursor: pointer;
  font-size: 12px;
}
.mastery-actions :deep(.primary) {
  border-color: var(--blue-2);
  background: var(--blue-2);
  color: var(--on-accent);
}
</style>
