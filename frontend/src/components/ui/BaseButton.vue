<template>
  <button class="ui-button" :type="type" :disabled="disabled || loading" :aria-busy="loading || undefined">
    <slot name="loading" v-if="loading" />
    <slot v-else />
  </button>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
    loading?: boolean
  }>(),
  {
    type: 'button',
    disabled: false,
    loading: false,
  },
)
</script>
