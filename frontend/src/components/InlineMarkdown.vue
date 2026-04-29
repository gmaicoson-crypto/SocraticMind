<template>
  <span>
    <template v-for="(part, i) in parts" :key="i">
      <strong v-if="part.type === 'bold'">{{ part.text }}</strong>
      <code v-else-if="part.type === 'code'" class="inline-code">{{ part.text }}</code>
      <span v-else>{{ part.text }}</span>
    </template>
    <template>
      <div class="md-inline">
        <span v-html="renderedHtml" />
        <span v-if="withCaret" class="typing-caret" />
      </div>
    </template>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'

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

const renderedHtml = computed(() => {
  if (!props.text) return ''
  return marked.parse(props.text, { breaks: true }) as string
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

/* 代码块样式 */
.md-inline :deep(pre) {
  background: var(--bg-3);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px 14px;
  overflow-x: auto;
  margin: 8px 0;
  font-size: 12.5px;
  line-height: 1.6;
}

.md-inline :deep(pre code) {
  background: transparent;
  padding: 0;
  color: var(--ink);
  font-family: var(--font-mono);
}

.md-inline :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.9em;
  background: var(--blue-tint);
  color: var(--blue-2);
  padding: 1px 6px;
  border-radius: 4px;
}

.md-inline :deep(p) {
  margin: 4px 0;
  line-height: 1.6;
}

.md-inline :deep(p:first-child) { margin-top: 0; }
.md-inline :deep(p:last-child) { margin-bottom: 0; }

.md-inline :deep(strong) { font-weight: 600; }

.md-inline :deep(ul),
.md-inline :deep(ol) {
  padding-left: 20px;
  margin: 6px 0;
}

.md-inline :deep(li) { margin: 3px 0; }

.md-inline :deep(blockquote) {
  border-left: 3px solid var(--blue-line);
  padding-left: 12px;
  margin: 8px 0;
  color: var(--ink-2);
}
</style>