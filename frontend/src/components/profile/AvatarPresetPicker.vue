<template>
  <div class="avatar-preset-picker" role="group" :aria-label="label">
    <button
      v-for="(url, index) in options"
      :key="url"
      type="button"
      class="preset-option"
      :class="{ selected: modelValue === url }"
      :aria-label="`${label} ${index + 1}`"
      :aria-pressed="modelValue === url"
      :disabled="disabled"
      @click="emit('select', url)"
    >
      <img :src="avatarSrc(url)" alt="" loading="lazy" decoding="async" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { avatarSrc } from '../../utils/avatar'

defineProps<{
  label: string
  options: string[]
  modelValue: string | null
  disabled?: boolean
}>()

const emit = defineEmits<{ select: [url: string] }>()
</script>

<style scoped>
.avatar-preset-picker {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
  gap: 8px;
  max-height: 184px;
  overflow-y: auto;
  padding: 3px;
}

.preset-option {
  width: 100%;
  aspect-ratio: 1;
  border: 2px solid transparent;
  border-radius: 8px;
  padding: 2px;
  background: var(--bg-2);
  cursor: pointer;
}

.preset-option img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 5px;
}

.preset-option:hover:not(:disabled),
.preset-option:focus-visible,
.preset-option.selected {
  border-color: var(--blue-2);
}

.preset-option:disabled {
  cursor: wait;
  opacity: 0.6;
}
</style>
