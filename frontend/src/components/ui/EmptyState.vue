<template>
  <div class="ui-empty-state" role="status">
    <slot name="icon" />
    <slot>{{ message }}</slot>
    <slot name="action" />
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    message?: string
  }>(),
  {
    message: '',
  },
)
</script>
