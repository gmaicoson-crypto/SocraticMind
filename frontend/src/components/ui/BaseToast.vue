<template>
  <Teleport to="body">
    <Transition name="ui-toast">
      <div v-if="message" class="ui-toast" role="alert" aria-atomic="true">
        {{ message }}
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'

const props = withDefaults(defineProps<{ message: string; duration?: number }>(), {
  duration: 4000,
})
const emit = defineEmits<{ 'update:message': [message: string] }>()
let timer: ReturnType<typeof setTimeout> | undefined

watch(
  () => props.message,
  (message) => {
    clearTimeout(timer)
    if (message) timer = setTimeout(() => emit('update:message', ''), props.duration)
  },
  { immediate: true },
)

onBeforeUnmount(() => clearTimeout(timer))
</script>

<style scoped>
.ui-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  z-index: 999;
  width: max-content;
  max-width: min(480px, calc(100vw - 32px));
  padding: 10px 16px;
  border-radius: 10px;
  background: var(--toast-bg);
  color: var(--on-accent);
  box-shadow: var(--toast-shadow);
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
  pointer-events: none;
  transform: translateX(-50%);
}

.ui-toast-enter-active,
.ui-toast-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.ui-toast-enter-from,
.ui-toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(10px);
}
</style>
