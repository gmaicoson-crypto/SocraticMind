<template>
  <Teleport to="body">
    <Transition :name="transitionName">
      <slot v-if="modelValue" />
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'

const openModalStack: symbol[] = []

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    closeDisabled?: boolean
    closeOnEscape?: boolean
    transitionName?: string
  }>(),
  {
    closeDisabled: false,
    closeOnEscape: true,
    transitionName: 'fade',
  },
)

const emit = defineEmits<{
  close: []
  'update:modelValue': [value: boolean]
}>()

const modalId = Symbol('modal')

function removeFromStack() {
  const index = openModalStack.indexOf(modalId)
  if (index >= 0) openModalStack.splice(index, 1)
}

function requestClose() {
  if (props.closeDisabled) return
  emit('update:modelValue', false)
  emit('close')
}

function onKeydown(event: KeyboardEvent) {
  const isTopModal = openModalStack.at(-1) === modalId
  if (event.key === 'Escape' && props.modelValue && props.closeOnEscape && isTopModal)
    requestClose()
}

watch(
  () => props.modelValue,
  (isOpen) => {
    removeFromStack()
    if (isOpen) {
      openModalStack.push(modalId)
      document.addEventListener('keydown', onKeydown)
    } else {
      document.removeEventListener('keydown', onKeydown)
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  removeFromStack()
  document.removeEventListener('keydown', onKeydown)
})
</script>
