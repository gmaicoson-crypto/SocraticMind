<template>
  <input
    class="ui-input"
    :value="modelValue"
    :type="type"
    :disabled="disabled"
    :aria-invalid="invalid || undefined"
    @input="onInput"
  />
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue?: string | number
    type?: string
    disabled?: boolean
    invalid?: boolean
  }>(),
  {
    modelValue: '',
    type: 'text',
    disabled: false,
    invalid: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}
</script>
