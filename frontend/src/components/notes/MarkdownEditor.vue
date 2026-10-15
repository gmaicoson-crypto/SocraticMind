<template>
  <div class="md-wrap">
    <div class="md-toolbar">
      <div class="view-switch">
        <button
          v-for="v in views"
          :key="v.key"
          class="view-btn"
          :class="{ active: viewMode === v.key }"
          @click="viewMode = v.key"
        >
          {{ v.label }}
        </button>
      </div>
      <div class="md-meta">
        <span>{{ content.length }} 字符</span>
        <span aria-hidden="true">·</span>
        <button class="help-btn ui-icon-button" title="Markdown 语法说明" @click="showHelp = true">
          <CircleHelp :size="13" aria-hidden="true" />
        </button>
        <button
          class="download-btn ui-icon-surface"
          title="下载 Markdown 文件"
          @click="handleDownload"
        >
          <Download :size="12" aria-hidden="true" />
          下载
        </button>
      </div>
    </div>

    <div class="md-body" :class="viewMode">
      <textarea
        v-if="viewMode !== 'preview'"
        v-model="content"
        class="md-editor"
        :placeholder="PLACEHOLDER"
        spellcheck="false"
        @input="saveContent"
      />
      <div v-if="viewMode !== 'edit'" class="md-preview" v-html="renderedHtml" />
    </div>

    <MarkdownHelpModal :show="showHelp" @close="showHelp = false" />
  </div>
</template>

<script setup lang="ts">
import { CircleHelp, Download } from '@lucide/vue'
// MarkdownEditor 组件，封装局部界面和交互逻辑。
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { marked } from 'marked'
import hljs from 'highlight.js'
import MarkdownHelpModal from './MarkdownHelpModal.vue'

const STORAGE_KEY = 'sm_markdown_content'

const PLACEHOLDER = `在这里记录你的学习笔记…

支持完整 Markdown 语法（含 GFM）：
# 标题  **粗体**  *斜体*  ~~删除~~  \`代码\`
- [x] 任务列表
| 表格 | GFM |

\`\`\`python
print("Hello, World!")
\`\`\`

点击右上角 ? 查看完整语法`

const savedContent = localStorage.getItem(STORAGE_KEY)
const content = ref(savedContent ?? '')

const viewMode = ref<'edit' | 'split' | 'preview'>('split')
const showHelp = ref(false)

const views = [
  { key: 'edit' as const, label: '编辑' },
  { key: 'split' as const, label: '并排' },
  { key: 'preview' as const, label: '预览' },
]

const renderer = new marked.Renderer()

renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
  const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'
  const highlighted = hljs.highlight(text, { language }).value
  const langLabel = lang ? `<span class="md-code-lang">${lang}</span>` : ''
  return `<div class="md-code-block">
    <div class="md-code-header">${langLabel}</div>
    <pre><code class="hljs language-${language}">${highlighted}</code></pre>
  </div>`
}

renderer.codespan = ({ text }: { text: string }) => `<code class="md-inline-code">${text}</code>`

marked.setOptions({
  gfm: true,
  breaks: true,
})

const renderedHtml = computed(() => {
  if (!content.value.trim()) {
    return '<p style="color:var(--ink-3);font-size:13px;">预览区域 · 开始编辑后这里会实时渲染</p>'
  }
  return marked.parse(content.value, { renderer }) as string
})

function saveContent() {
  localStorage.setItem(STORAGE_KEY, content.value)
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
watch(content, () => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    localStorage.setItem(STORAGE_KEY, content.value)
  }, 500)
})

onBeforeUnmount(() => {
  if (saveTimer) clearTimeout(saveTimer)
})

function handleDownload() {
  const blob = new Blob([content.value], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '笔记.md'
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.md-wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 8px;
}

.md-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.view-switch {
  display: flex;
  gap: 1px;
  background: var(--bg-3);
  border-radius: 8px;
  padding: 2px;
}
.view-btn {
  padding: 5px 12px;
  font-size: 11.5px;
  font-weight: 500;
  background: transparent;
  color: var(--ink-2);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-family: var(--font-sans);
  transition: all 0.15s;
}
.view-btn.active {
  background: var(--surface);
  color: var(--ink);
  box-shadow:
    0 1px 0 var(--line),
    var(--control-shadow);
}

.md-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--ink-3);
  font-family: var(--font-mono);
}

.help-btn {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
}

.download-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  font-size: 11px;
  font-family: var(--font-mono);
  cursor: pointer;
  transition: all 0.15s;
}

.md-body {
  flex: 1;
  min-height: 0;
  display: grid;
  gap: 8px;
}
.md-body.split {
  grid-template-columns: 1fr 1fr;
}
.md-body.edit,
.md-body.preview {
  grid-template-columns: 1fr;
}

.md-editor {
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--ink);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  padding: 14px 16px;
  resize: none;
  outline: none;
  width: 100%;
  height: 100%;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.md-editor:focus {
  border-color: var(--blue);
  box-shadow: 0 0 0 3px var(--focus-ring);
  background: var(--surface);
}
.md-editor::placeholder {
  color: var(--ink-3);
  line-height: 1.8;
}

.md-preview {
  padding: 14px 18px;
  overflow-y: auto;
  background: var(--surface);
  border-radius: var(--radius-sm);
  border: 1px solid var(--line);
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--ink);
}

.md-preview :deep(h1),
.md-preview :deep(h2),
.md-preview :deep(h3),
.md-preview :deep(h4),
.md-preview :deep(h5),
.md-preview :deep(h6) {
  color: var(--ink);
  margin: 14px 0 8px;
  font-weight: 600;
  line-height: 1.35;
}
.md-preview :deep(h1) {
  font-size: 19px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--line);
}
.md-preview :deep(h2) {
  font-size: 16.5px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--line);
}
.md-preview :deep(h3) {
  font-size: 14.5px;
}
.md-preview :deep(h4) {
  font-size: 13.5px;
}
.md-preview :deep(h5) {
  font-size: 12.5px;
}
.md-preview :deep(h6) {
  font-size: 12px;
  color: var(--ink-2);
}

.md-preview :deep(p) {
  margin: 8px 0;
}

.md-preview :deep(strong) {
  font-weight: 600;
}
.md-preview :deep(em) {
  font-style: italic;
}
.md-preview :deep(del) {
  text-decoration: line-through;
  color: var(--ink-3);
}
.md-preview :deep(mark) {
  background: var(--highlight-bg);
  padding: 0 3px;
  border-radius: 2px;
}

.md-preview :deep(a) {
  color: var(--blue-2);
  text-decoration: none;
  border-bottom: 1px solid var(--blue-line);
}
.md-preview :deep(a:hover) {
  border-bottom-color: var(--blue-2);
}

.md-preview :deep(.md-code-block) {
  margin: 10px 0;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--line);
  background: var(--code-bg);
}
.md-preview :deep(.md-code-header) {
  display: flex;
  justify-content: flex-end;
  padding: 4px 12px;
  background: var(--code-header-bg);
  border-bottom: 1px solid var(--code-border);
  min-height: 16px;
}
.md-preview :deep(.md-code-lang) {
  font-size: 10.5px;
  font-family: var(--font-mono);
  color: var(--code-muted);
  text-transform: lowercase;
  letter-spacing: 0.05em;
}
.md-preview :deep(.md-code-block pre) {
  margin: 0;
  padding: 12px 14px;
  overflow-x: auto;
  background: var(--code-bg);
  border: none;
  border-radius: 0;
}
.md-preview :deep(.md-code-block pre code) {
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.65;
  background: transparent;
  padding: 0;
  color: var(--code-text);
}

.md-preview :deep(ul),
.md-preview :deep(ol) {
  padding-left: 22px;
  margin: 8px 0;
}
.md-preview :deep(li) {
  margin: 3px 0;
}
.md-preview :deep(li > p) {
  margin: 4px 0;
}

.md-preview :deep(li:has(> input[type='checkbox'])) {
  list-style: none;
  margin-left: -18px;
}
.md-preview :deep(li > input[type='checkbox']) {
  margin-right: 6px;
  vertical-align: middle;
  accent-color: var(--blue-2);
}

.md-preview :deep(blockquote) {
  border-left: 3px solid var(--blue-line);
  padding: 4px 12px;
  margin: 10px 0;
  color: var(--ink-2);
  background: var(--blue-tint);
  border-radius: 0 6px 6px 0;
}
.md-preview :deep(blockquote blockquote) {
  margin: 6px 0;
  background: transparent;
}

.md-preview :deep(hr) {
  border: none;
  border-top: 1px solid var(--line);
  margin: 14px 0;
}

.md-preview :deep(table) {
  border-collapse: collapse;
  margin: 10px 0;
  font-size: 12.5px;
  width: auto;
  max-width: 100%;
  display: block;
  overflow-x: auto;
}
.md-preview :deep(thead) {
  background: var(--bg-3);
}
.md-preview :deep(th),
.md-preview :deep(td) {
  border: 1px solid var(--line);
  padding: 6px 12px;
  text-align: left;
  vertical-align: top;
}
.md-preview :deep(th) {
  font-weight: 600;
}
.md-preview :deep(tbody tr:nth-child(even)) {
  background: var(--bg-2);
}

.md-preview :deep(img) {
  max-width: 100%;
  border-radius: 6px;
  margin: 6px 0;
}

.md-preview :deep(kbd) {
  font-family: var(--font-mono);
  font-size: 11.5px;
  background: var(--bg-3);
  color: var(--ink);
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid var(--line);
  box-shadow: inset 0 -1px 0 var(--line-2);
}

.md-preview :deep(details) {
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 8px 12px;
  margin: 8px 0;
  background: var(--bg-2);
}
.md-preview :deep(summary) {
  cursor: pointer;
  font-weight: 500;
  color: var(--ink);
}
</style>
