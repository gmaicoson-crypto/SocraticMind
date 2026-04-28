<template>
  <span>
    <template v-for="(part, i) in parts" :key="i">
      <strong v-if="part.type === 'bold'">{{ part.text }}</strong>
      <code v-else-if="part.type === 'code'" class="inline-code">{{ part.text }}</code>
      <span v-else>{{ part.text }}</span>
    </template>
    <span v-if="withCaret" class="typing-caret" />
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  text: string
  withCaret?: boolean
}>()

const parts = computed(() => {
  const result: { type: 'text' | 'bold' | 'code'; text: string }[] = []
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = regex.exec(props.text)) !== null) {
    if (m.index > last) result.push({ type: 'text', text: props.text.slice(last, m.index) })
    const tok = m[0]
    if (tok.startsWith('**')) result.push({ type: 'bold', text: tok.slice(2, -2) })
    else result.push({ type: 'code', text: tok.slice(1, -1) })
    last = regex.lastIndex
  }
  if (last < props.text.length) result.push({ type: 'text', text: props.text.slice(last) })
  return result
})
</script>

<style scoped>
.inline-code {
  font-family: var(--font-mono);
  font-size: 0.92em;
  background: var(--blue-tint);
  color: var(--blue-2);
  padding: 1px 6px;
  border-radius: 4px;
}

.typing-caret {
  display: inline-block;
  width: 7px; height: 14px;
  background: var(--blue-2);
  margin-left: 2px;
  vertical-align: -2px;
  border-radius: 1px;
  animation: blink 1s steps(1) infinite;
}

@keyframes blink {
  0%, 60% { opacity: 1; }
  70%, 100% { opacity: 0; }
}
</style>