<template>
  <div
    class="ui-progress-bar"
    role="progressbar"
    :aria-label="label || undefined"
    :aria-valuemin="0"
    :aria-valuemax="100"
    :aria-valuenow="normalizedValue"
  >
    <div class="ui-progress-bar__fill" :style="{ width: `${normalizedValue}%` }" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    value?: number
    label?: string
  }>(),
  {
    value: 0,
    label: '',
  },
)

const normalizedValue = computed(() => Math.min(100, Math.max(0, props.value)))
</script>
