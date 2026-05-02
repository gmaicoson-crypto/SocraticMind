<template>
  <div class="md-inline" v-html="renderedHtml" />
  <span v-if="withCaret" class="typing-caret" />
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { marked } from 'marked'
import hljs from 'highlight.js'

const props = defineProps<{
  text: string
  withCaret?: boolean
}>()

// 配置 marked 使用 highlight.js 高亮代码
marked.setOptions({
  breaks: true,
  gfm: true,
})

// 自定义 renderer，代码块加高亮和语言标签
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

// CommonMark 规定：** 后紧跟 Unicode 标点（如引号、括号）时不构成左侧定界符，
// 导致 **”text”** 无法渲染为粗体。插入零宽空格 U+200B（Cf 类，非标点非空白）
// 使 ** 重新满足定界条件，且不影响可见输出。
// 全部通过 fromCodePoint 构造，源码中不出现任何 Unicode 特殊字符
function preprocessMarkdown(md: string): string {
  // U+200B ZERO WIDTH SPACE
  const zwsp = String.fromCodePoint(0x200B)
  // 中英文引号及常用括号（码位列表，纯 ASCII 数字）
  const quoteCPs = [
    0x0022, 0x0027, // ASCII double/single quote
    0x201C, 0x201D, // left/right double quotation mark
    0x2018, 0x2019, // left/right single quotation mark
    0x300C, 0x300D, // corner brackets
    0x300E, 0x300F, // white corner brackets
    0x300A, 0x300B, // double angle brackets
    0x3008, 0x3009, // angle brackets
    0x3010, 0x3011, // black lenticular brackets
    0x2039, 0x203A, // single guillemets
    0x00AB, 0x00BB, // double guillemets
  ]
  const quotes = quoteCPs.map(function(cp) { return String.fromCodePoint(cp) }).join("")
  const cls = "([" + quotes + "])"
  const delim = "(\\*{1,2}|_{1,2})"
  // ** 紧跟引号/括号 → 插零宽空格，修复左侧定界符
  md = md.replace(new RegExp(delim + cls, "g"), "$1" + zwsp + "$2")
  // 引号/括号 紧跟 ** → 插零宽空格，修复右侧定界符
  md = md.replace(new RegExp(cls + delim, "g"), "$1" + zwsp + "$2")
  return md
}

// rAF 节流的渲染：流式追加 chunk 时不再每次都跑完整 marked.parse + 代码高亮，
// 而是合并成每帧最多一次。withCaret=true（流式态）才节流；静态消息直接同步渲染
const renderedHtml = ref('')
let pendingFrame: number | null = null

function compileNow(text: string) {
  renderedHtml.value = text ? (marked.parse(preprocessMarkdown(text), { renderer }) as string) : ''
}

watch(() => props.text, (text) => {
  if (props.withCaret) {
    if (pendingFrame !== null) return
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = null
      compileNow(props.text)
    })
  } else {
    compileNow(text)
  }
}, { immediate: true })

onBeforeUnmount(() => {
  if (pendingFrame !== null) cancelAnimationFrame(pendingFrame)
})
</script>

<style scoped>
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

<style>
/* 全局样式，影响 v-html 渲染内容 */
.md-inline p {
  margin: 6px 0;
  line-height: 1.7;
}
.md-inline p:first-child { margin-top: 0; }
.md-inline p:last-child { margin-bottom: 0; }

.md-inline strong { font-weight: 600; }
.md-inline em { font-style: italic; }

.md-inline h1, .md-inline h2, .md-inline h3 {
  font-weight: 600;
  margin: 12px 0 6px;
  line-height: 1.4;
}
.md-inline h1 { font-size: 17px; }
.md-inline h2 { font-size: 15px; }
.md-inline h3 { font-size: 13.5px; }

.md-inline ul, .md-inline ol {
  padding-left: 20px;
  margin: 6px 0;
}
.md-inline li { margin: 4px 0; line-height: 1.6; }

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

/* 行内代码 */
.md-inline .inline-code {
  font-family: var(--font-mono);
  font-size: 0.88em;
  background: var(--blue-tint);
  color: var(--blue-2);
  padding: 1px 6px;
  border-radius: 4px;
}

/* 代码块容器 */
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
  border-bottom: 1px solid rgba(255,255,255,0.08);
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
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 5px;
  padding: 2px 8px;
  cursor: pointer;
  transition: all .15s;
}
.md-inline .code-copy:hover {
  color: #fff;
  border-color: rgba(255,255,255,0.3);
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

/* highlight.js 颜色主题（Catppuccin Mocha 风格） */
.md-inline .hljs-keyword,
.md-inline .hljs-selector-tag { color: #cba6f7; }

.md-inline .hljs-string,
.md-inline .hljs-attr { color: #a6e3a1; }

.md-inline .hljs-number,
.md-inline .hljs-literal { color: #fab387; }

.md-inline .hljs-comment { color: #6c7086; font-style: italic; }

.md-inline .hljs-function,
.md-inline .hljs-title { color: #89b4fa; }

.md-inline .hljs-variable,
.md-inline .hljs-name { color: #cdd6f4; }

.md-inline .hljs-type,
.md-inline .hljs-class { color: #f9e2af; }

.md-inline .hljs-built_in { color: #89dceb; }

.md-inline .hljs-operator,
.md-inline .hljs-punctuation { color: #89dceb; }

.md-inline .hljs-property { color: #f38ba8; }

/* 表格 */
.md-inline table {
  border-collapse: collapse;
  width: 100%;
  margin: 8px 0;
  font-size: 13px;
}
.md-inline th, .md-inline td {
  border: 1px solid var(--line);
  padding: 6px 10px;
  text-align: left;
}
.md-inline th {
  background: var(--bg-3);
  font-weight: 600;
}
.md-inline tr:nth-child(even) { background: var(--bg-2); }
</style>