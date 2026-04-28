<template>
  <g
    :transform="`translate(${node.x}, ${node.y})`"
    :style="{ cursor: node.state === 'locked' ? 'not-allowed' : 'pointer' }"
    :class="{ 'node-mastered': node.state === 'mastered' }"
    @click="emit('click', node)"
    @mouseenter="emit('hover', { node, event: $event })"
    @mouseleave="emit('hover', { node: null })"
  >
    <!-- 选中时的虚线边框 -->
    <rect
      v-if="isSelected"
      :x="-W/2 - 4" :y="-H/2 - 4"
      :width="W + 8" :height="H + 8"
      :rx="R + 4"
      fill="none"
      stroke="var(--blue)"
      stroke-width="1.5"
      stroke-dasharray="3 3"
      opacity="0.7"
    />

    <!-- 节点主体 -->
    <rect
      class="node-bg"
      :x="-W/2" :y="-H/2"
      :width="W" :height="H"
      :rx="R"
      :fill="styles.bg"
      :stroke="styles.stroke"
      stroke-width="1.3"
    />

    <!-- 状态图标 -->
    <!-- 已掌握：对勾 -->
    <g v-if="node.state === 'mastered'" :transform="`translate(${-W/2 + 14}, 0)`">
      <path d="M-5 0 L-1 4 L6 -4" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
    <!-- 锁定：锁图标 -->
    <g v-else-if="node.state === 'locked'" :transform="`translate(${-W/2 + 14}, 0)`" :style="{ color: styles.icon }">
      <rect x="-5" y="0" width="10" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/>
      <path d="M-3 0 V-2 a3 3 0 0 1 6 0 V0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </g>
    <!-- 可用：小圆点 -->
    <g v-else :transform="`translate(${-W/2 + 14}, 0)`">
      <circle r="3" :fill="styles.icon" />
    </g>

    <!-- 标签 -->
    <text
      x="6" y="-4"
      text-anchor="middle"
      font-size="12"
      font-weight="600"
      :fill="styles.label"
      font-family="Inter, 'Noto Sans SC', sans-serif"
    >{{ node.label }}</text>

    <text
      x="6" y="13"
      text-anchor="middle"
      font-size="9.5"
      :fill="styles.sub"
      font-family="'JetBrains Mono', monospace"
      letter-spacing="0.02em"
    >{{ node.sub }}</text>
  </g>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { KNode } from '../types'

const props = defineProps<{
  node: KNode
  isSelected: boolean
}>()

const emit = defineEmits<{
  click: [node: KNode]
  hover: [payload: { node: KNode | null; event?: MouseEvent }]
}>()

const W = 110
const H = 52
const R = 14

const styles = computed(() => {
  const s = props.node.state
  if (s === 'mastered') return {
    bg: 'var(--blue)',
    stroke: 'var(--blue-2)',
    label: 'white',
    sub: 'oklch(0.95 0.02 235)',
    icon: 'white',
  }
  if (s === 'available') return {
    bg: 'var(--surface)',
    stroke: 'var(--blue)',
    label: 'var(--ink)',
    sub: 'var(--blue-2)',
    icon: 'var(--blue-2)',
  }
  return {
    bg: 'var(--bg-3)',
    stroke: 'var(--locked)',
    label: 'var(--locked-ink)',
    sub: 'var(--locked-ink)',
    icon: 'var(--locked-ink)',
  }
})
</script>

<style scoped>
.node-mastered .node-bg {
  animation: pulseGlow 3.4s ease-in-out infinite;
}

@keyframes pulseGlow {
  0%, 100% { filter: drop-shadow(0 0 0 oklch(0.72 0.085 235 / 0)); }
  50%       { filter: drop-shadow(0 0 6px oklch(0.72 0.085 235 / 0.6)); }
}
</style>