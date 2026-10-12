<template>
  <div class="md-inline" @click="copyCode" v-html="renderedHtml" />
  <AttachmentViewer
    v-if="activeSource"
    :open="true"
    :attachment-id="activeSource.attachment_id"
    :name="activeSource.title"
    :image="activeSource.kind === 'image'"
    :chunk-id="activeSource.chunk_id"
    :revision="activeSource.revision"
    :deleted="activeSource.deleted"
    :summary-text="activeSource.summary ? activeSource.excerpt : undefined"
    :summary-coverage="activeSource.coverage?.map(attachmentLocation).join('、')"
    @close="activeSource = null"
  />
  <span v-if="withCaret" class="typing-caret" />
</template>

<script setup lang="ts">
// InlineMarkdown 组件，封装局部界面和交互逻辑。
import { ref, watch, onBeforeUnmount } from 'vue'
import AttachmentViewer from '../attachments/AttachmentViewer.vue'
import { attachmentLocation } from '../../types/attachments'
import type { FileSource } from '../../types/webSearch'
import type { WebSnapshot } from '../../types/webSearch'
import { createMessageMarkdownRenderer } from '../../utils/messageMarkdown'

const props = defineProps<{
  text: string
  withCaret?: boolean
  assistant?: boolean
  web?: WebSnapshot
}>()
const renderMarkdown = createMessageMarkdownRenderer()

const activeSource = ref<FileSource | null>(null)
async function copyCode(event: MouseEvent) {
  const citation =
    event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>('button.file-citation')
      : null
  if (citation) {
    const source = props.web?.sources.find(
      (item) => item.id === citation.getAttribute('aria-label'),
    )
    if (source && (source.kind === 'document' || source.kind === 'image'))
      activeSource.value = source
    return
  }
  const target =
    event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>('button.code-copy')
      : null
  if (!target || !(event.currentTarget instanceof Element) || !event.currentTarget.contains(target))
    return
  const code = target.closest('.code-block')?.querySelector('code')
  if (!code) return
  try {
    await navigator.clipboard.writeText(code.textContent ?? '')
    target.textContent = '已复制'
  } catch {
    target.textContent = '复制失败'
  }
}

function preprocessMarkdown(md: string): string {
  const zwsp = String.fromCodePoint(0x200b)
  const quoteCPs = [
    0x0022, 0x0027, 0x201c, 0x201d, 0x2018, 0x2019, 0x300c, 0x300d, 0x300e, 0x300f, 0x300a, 0x300b,
    0x3008, 0x3009, 0x3010, 0x3011, 0x2039, 0x203a, 0x00ab, 0x00bb,
  ]
  const quotes = quoteCPs
    .map(function (cp) {
      return String.fromCodePoint(cp)
    })
    .join('')
  const cls = '([' + quotes + '])'
  const delim = '(\\*{1,2}|_{1,2})'
  md = md.replace(new RegExp(delim + cls, 'g'), '$1' + zwsp + '$2')
  md = md.replace(new RegExp(cls + delim, 'g'), '$1' + zwsp + '$2')
  return md
}

const renderedHtml = ref('')
let pendingFrame: number | null = null

function compileNow(text: string) {
  renderedHtml.value = text
    ? renderMarkdown(preprocessMarkdown(text), {
        web: props.web,
        assistant: props.assistant,
        streaming: props.withCaret,
      }).html
    : ''
}

watch(
  () => [props.text, props.web, props.assistant, props.withCaret] as const,
  ([text]) => {
    if (props.withCaret) {
      if (pendingFrame !== null) return
      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = null
        compileNow(props.text)
      })
    } else {
      compileNow(text)
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (pendingFrame !== null) cancelAnimationFrame(pendingFrame)
})
</script>

<style scoped>
.typing-caret {
  display: inline-block;
  width: 7px;
  height: 14px;
  background: var(--blue-2);
  margin-left: 2px;
  vertical-align: -2px;
  border-radius: 1px;
  animation: blink 1s steps(1) infinite;
}

@keyframes blink {
  0%,
  60% {
    opacity: 1;
  }
  70%,
  100% {
    opacity: 0;
  }
}
</style>

<style>
.md-inline p {
  margin: 6px 0;
  line-height: 1.7;
}
.md-inline p:first-child {
  margin-top: 0;
}
.md-inline p:last-child {
  margin-bottom: 0;
}

.md-inline strong {
  font-weight: 600;
}
.md-inline em {
  font-style: italic;
}

.md-inline h1,
.md-inline h2,
.md-inline h3 {
  font-weight: 600;
  margin: 12px 0 6px;
  line-height: 1.4;
}
.md-inline h1 {
  font-size: 17px;
}
.md-inline h2 {
  font-size: 15px;
}
.md-inline h3 {
  font-size: 13.5px;
}

.md-inline ul,
.md-inline ol {
  padding-left: 20px;
  margin: 6px 0;
}
.md-inline li {
  margin: 4px 0;
  line-height: 1.6;
}

.md-inline blockquote {
  border-left: 3px solid var(--blue-line);
  padding-left: 12px;
  margin: 8px 0;
  color: var(--ink-2);
}

.md-inline hr {
  border: none;
  border-top: 1px solid var(--line);
  margin: 10px 0;
}

.md-inline .code-block {
  margin: 10px 0;
  border-radius: 10px;
  overflow: hidden;
  background: var(--code-bg);
  border: 1px solid var(--code-border);
}

.md-inline .code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 14px;
  background: var(--code-header-bg);
  border-bottom: 1px solid var(--code-border);
}

.md-inline .code-lang {
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--code-muted);
  text-transform: lowercase;
  letter-spacing: 0.05em;
}

.md-inline .code-copy {
  font-size: 11px;
  font-family: var(--font-sans);
  color: var(--code-muted);
  background: transparent;
  border: 1px solid var(--line-2);
  border-radius: 5px;
  padding: 2px 8px;
  cursor: pointer;
  transition: all 0.15s;
}
.md-inline .code-copy:hover {
  color: var(--ink);
  border-color: var(--line-3);
}

.md-inline pre {
  margin: 0;
  padding: 14px 16px;
  overflow-x: auto;
  background: var(--code-bg);
}

.md-inline pre code {
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.65;
  background: transparent;
  padding: 0;
  color: var(--code-text);
}

.md-inline table {
  border-collapse: collapse;
  width: 100%;
  margin: 8px 0;
  font-size: 13px;
}
.md-inline th,
.md-inline td {
  border: 1px solid var(--line);
  padding: 6px 10px;
  text-align: left;
}
.md-inline th {
  background: var(--bg-3);
  font-weight: 600;
}
.md-inline tr:nth-child(even) {
  background: var(--bg-2);
}
</style>

<style scoped>
:deep(.file-citation) {
  border: 0;
  background: transparent;
  cursor: pointer;
  padding: 0;
}
:deep(.source-citation) {
  font-size: 0.8em;
  vertical-align: super;
  margin-inline: 2px;
  color: var(--blue);
}
:deep(.source-unavailable) {
  color: var(--ink-3);
  font-size: 0.85em;
}
</style>
