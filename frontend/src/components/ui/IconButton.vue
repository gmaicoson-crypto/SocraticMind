<template>
  <BaseButton
    class="ui-icon-button"
    :type="type"
    :disabled="disabled"
    :loading="loading"
    :aria-label="label"
    :title="title || label"
  >
    <template #loading><slot name="loading" /></template>
    <slot />
  </BaseButton>
</template>

<script setup lang="ts">
import BaseButton from './BaseButton.vue'

withDefaults(
  defineProps<{
    label: string
    title?: string
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
    loading?: boolean
  }>(),
  {
    title: '',
    type: 'button',
    disabled: false,
    loading: false,
  },
)
</script>
