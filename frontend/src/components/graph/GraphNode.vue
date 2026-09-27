<template>
  <g
    class="knode"
    :transform="`translate(${node.x}, ${node.y})`"
    :style="{ cursor: node.state === 'locked' ? 'not-allowed' : 'pointer' }"
    :class="{ 'node-mastered': node.state === 'mastered' }"
    @click="emit('click', node)"
  >
    <rect
      v-if="isSelected"
      :x="-W / 2 - 4"
      :y="-H / 2 - 4"
      :width="W + 8"
      :height="H + 8"
      :rx="R + 4"
      fill="none"
      stroke="var(--blue)"
      stroke-width="1.5"
      stroke-dasharray="3 3"
      opacity="0.7"
    />

    <rect
      class="node-bg"
      :x="-W / 2"
      :y="-H / 2"
      :width="W"
      :height="H"
      :rx="R"
      :fill="styles.bg"
      :stroke="styles.stroke"
      stroke-width="1.3"
    />

    <g v-if="node.state === 'mastered'" :transform="`translate(${-W / 2 + 14}, 0)`">
      <path
        d="M-5 0 L-1 4 L6 -4"
        fill="none"
        stroke="white"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </g>
    <g
      v-else-if="node.state === 'locked'"
      :transform="`translate(${-W / 2 + 14}, 0)`"
      :style="{ color: styles.icon }"
    >
      <rect
        x="-5"
        y="0"
        width="10"
        height="8"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      />
      <path
        d="M-3 0 V-2 a3 3 0 0 1 6 0 V0"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
      />
    </g>
    <g v-else :transform="`translate(${-W / 2 + 14}, 0)`">
      <circle r="3" :fill="styles.icon" />
    </g>

    <text
      x="6"
      y="-4"
      text-anchor="middle"
      font-size="12"
      font-weight="600"
      :fill="styles.label"
      font-family="Inter, 'Noto Sans SC', sans-serif"
      >{{ truncate(node.label, 7) }}</text
    >

    <text
      x="6"
      y="13"
      text-anchor="middle"
      font-size="9.5"
      :fill="styles.sub"
      font-family="'JetBrains Mono', monospace"
      letter-spacing="0.02em"
      >{{ truncate(node.sub, 12) }}</text
    >
  </g>
</template>

<script setup lang="ts">
// GraphNode 组件，封装局部界面和交互逻辑。
import { computed } from 'vue'
import type { KNode } from '../../types'

const props = defineProps<{
  node: KNode
  isSelected: boolean
}>()

const emit = defineEmits<{
  click: [node: KNode]
}>()

const W = 120
const H = 52
const R = 14

function truncate(text: string, max: number): string {
  if (!text) return ''
  return text.length > max ? text.slice(0, max) + '…' : text
}

const styles = computed(() => {
  const s = props.node.state
  if (s === 'mastered')
    return {
      bg: 'var(--graph-node-mastered-bg)',
      stroke: 'var(--graph-node-mastered-stroke)',
      label: 'var(--graph-node-mastered-label)',
      sub: 'var(--graph-node-mastered-sub)',
      icon: 'var(--graph-node-mastered-icon)',
    }
  if (s === 'available')
    return {
      bg: 'var(--graph-node-available-bg)',
      stroke: 'var(--graph-node-available-stroke)',
      label: 'var(--graph-node-available-label)',
      sub: 'var(--graph-node-available-sub)',
      icon: 'var(--graph-node-available-icon)',
    }
  return {
    bg: 'var(--graph-node-locked-bg)',
    stroke: 'var(--graph-node-locked-stroke)',
    label: 'var(--graph-node-locked-label)',
    sub: 'var(--graph-node-locked-sub)',
    icon: 'var(--graph-node-locked-icon)',
  }
})
</script>

<style scoped>
.node-mastered .node-bg {
  animation: pulseGlow 3.4s ease-in-out infinite;
}
@keyframes pulseGlow {
  0%,
  100% {
    filter: drop-shadow(0 0 0 oklch(0.72 0.085 235 / 0));
  }
  50% {
    filter: drop-shadow(0 0 6px oklch(0.72 0.085 235 / 0.6));
  }
}
</style>
