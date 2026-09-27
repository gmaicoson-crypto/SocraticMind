<template>
  <path
    :d="pathD"
    fill="none"
    :stroke="stroke"
    :stroke-width="strokeWidth"
    :stroke-dasharray="dashArray"
    :opacity="opacity"
  />
</template>

<script setup lang="ts">
// GraphEdge 组件，封装局部界面和交互逻辑。
import { computed } from 'vue'
import type { KNode } from '../../types'

const props = defineProps<{
  from: KNode
  to: KNode
}>()

const edgeState = computed(() => {
  if (props.from.state === 'mastered' && props.to.state === 'mastered') return 'active'
  if (props.to.state === 'locked') return 'locked'
  return 'default'
})

const pathD = computed(() => {
  const { from, to } = props
  const dx = to.x - from.x
  const dy = to.y - from.y
  const c1x = from.x + dx * 0.1
  const c1y = from.y + dy * 0.55
  const c2x = to.x - dx * 0.1
  const c2y = to.y - dy * 0.55
  return `M ${from.x} ${from.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${to.x} ${to.y}`
})

const stroke = computed(() => {
  if (edgeState.value === 'active') return 'var(--blue)'
  if (edgeState.value === 'locked') return 'var(--locked)'
  return 'var(--blue-line)'
})

const strokeWidth = computed(() => (edgeState.value === 'active' ? 1.6 : 1))
const dashArray = computed(() => (edgeState.value === 'locked' ? '3 4' : 'none'))
const opacity = computed(() => (edgeState.value === 'locked' ? 0.5 : 0.85))
</script>
