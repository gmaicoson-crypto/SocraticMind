<template>
  <time :datetime="value || undefined" :title="formatFullTime(value ?? '')">
    {{ formatMessageTime(value ?? '') }}
  </time>
</template>

<script setup lang="ts">
import { formatFullTime, formatMessageTime } from '../../utils/chat'

defineProps<{ value: string | null }>()
</script>
