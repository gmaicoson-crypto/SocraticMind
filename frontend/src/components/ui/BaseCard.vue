<template>
  <component :is="tag" class="ui-card">
    <slot />
  </component>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    tag?: 'article' | 'aside' | 'div' | 'section'
  }>(),
  {
    tag: 'section',
  },
)
</script>
