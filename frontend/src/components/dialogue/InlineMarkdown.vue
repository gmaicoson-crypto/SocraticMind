<template>
  <div class="md-inline" v-html="renderedHtml" />
  <span v-if="withCaret" class="typing-caret" />
</template>

<script setup lang="ts">
// InlineMarkdown 组件，封装局部界面和交互逻辑。
import { ref, watch, onBeforeUnmount } from 'vue'
import { marked } from 'marked'
import hljs from 'highlight.js'

const props = defineProps<{
  text: string
  withCaret?: boolean
}>()

marked.setOptions({
  breaks: true,
  gfm: true,
})

const renderer = new marked.Renderer()

renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
  const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'
  const highlighted = hljs.highlight(text, { language }).value
  const langLabel = lang ? `<span class="code-lang">${lang}</span>` : ''
  return `<div class="code-block">
    <div class="code-header">
      ${langLabel}
      <button class="code-copy" onclick="navigator.clipboard.writeText(this.closest('.code-block').querySelector('code').innerText)">复制</button>
    </div>
    <pre><code class="hljs language-${language}">${highlighted}</code></pre>
  </div>`
}

renderer.codespan = ({ text }: { text: string }) => {
  return `<code class="inline-code">${text}</code>`
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
  renderedHtml.value = text ? (marked.parse(preprocessMarkdown(text), { renderer }) as string) : ''
}

watch(
  () => props.text,
  (text) => {
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
  border: 1px solid var(--line);
  background: #1e1e2e;
}

.md-inline .code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 14px;
  background: #2a2a3e;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.md-inline .code-lang {
  font-size: 11px;
  font-family: var(--font-mono);
  color: #888;
  text-transform: lowercase;
  letter-spacing: 0.05em;
}

.md-inline .code-copy {
  font-size: 11px;
  font-family: var(--font-sans);
  color: #888;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 5px;
  padding: 2px 8px;
  cursor: pointer;
  transition: all 0.15s;
}
.md-inline .code-copy:hover {
  color: #fff;
  border-color: rgba(255, 255, 255, 0.3);
}

.md-inline pre {
  margin: 0;
  padding: 14px 16px;
  overflow-x: auto;
  background: #1e1e2e;
}

.md-inline pre code {
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.65;
  background: transparent;
  padding: 0;
  color: #cdd6f4;
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
