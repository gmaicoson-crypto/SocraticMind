<template>
  <div class="md-wrap">

    <!-- Toolbar -->
    <div class="md-toolbar">
      <div class="view-switch">
        <button
          v-for="v in views"
          :key="v.key"
          class="view-btn"
          :class="{ active: viewMode === v.key }"
          @click="viewMode = v.key"
        >{{ v.label }}</button>
      </div>
      <div class="md-meta">
        <span>{{ content.length }} 字符</span>
        <span>·</span>
        <button class="download-btn" @click="handleDownload" title="下载 Markdown 文件">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M12 5v14M5 19h14M19 14l-7 7-7-7"/>
          </svg>
          下载
        </button>
      </div>
    </div>

    <!-- Editor / Preview -->
    <div class="md-body" :class="viewMode">
      <textarea
        v-if="viewMode !== 'preview'"
        v-model="content"
        class="md-editor"
        :placeholder="PLACEHOLDER"
        spellcheck="false"
        @input="saveContent"
      />
      <div
        v-if="viewMode !== 'edit'"
        class="md-preview"
        v-html="renderedHtml"
      />
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { marked } from 'marked'

const STORAGE_KEY = 'sm_markdown_content'

const PLACEHOLDER = `在这里记录你的学习笔记…

支持 Markdown 语法：
# 标题
**粗体** *斜体* \`代码\`

\`\`\`python
# 代码块
print("Hello, World!")
\`\`\`

> 引用块`

// 读取上次内容，没有则为空
const savedContent = localStorage.getItem(STORAGE_KEY)
const content = ref(savedContent ?? '')

const viewMode = ref<'edit' | 'split' | 'preview'>('split')

const views = [
  { key: 'edit' as const,    label: '编辑' },
  { key: 'split' as const,   label: '并排' },
  { key: 'preview' as const, label: '预览' },
]

const renderedHtml = computed(() => {
  if (!content.value.trim()) return '<p style="color:var(--ink-3);font-size:13px;">预览区域 · 开始编辑后这里会实时渲染</p>'
  return marked.parse(content.value, { breaks: true }) as string
})

// 自动保存到 localStorage
function saveContent() {
  localStorage.setItem(STORAGE_KEY, content.value)
}

// 监听内容变化自动保存（防抖）
let saveTimer: ReturnType<typeof setTimeout> | null = null
watch(content, () => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    localStorage.setItem(STORAGE_KEY, content.value)
  }, 500)
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
  transition: all .15s;
}

.view-btn.active {
  background: var(--surface);
  color: var(--ink);
  box-shadow: 0 1px 0 var(--line), 0 1px 2px oklch(0.7 0.014 78 / 0.06);
}

.md-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--ink-3);
  font-family: var(--font-mono);
}

.download-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--ink-3);
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 5px;
  cursor: pointer;
  transition: all .15s;
}
.download-btn:hover {
  color: var(--blue-2);
  border-color: var(--blue-line);
  background: var(--blue-tint);
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
  transition: border-color .15s, box-shadow .15s;
}

.md-editor:focus {
  border-color: var(--blue);
  box-shadow: 0 0 0 3px oklch(0.72 0.085 235 / 0.15);
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
.md-preview :deep(h3) {
  color: var(--ink);
  margin: 14px 0 8px;
  font-weight: 600;
}

.md-preview :deep(h1) { font-size: 18px; }
.md-preview :deep(h2) { font-size: 15.5px; }
.md-preview :deep(h3) { font-size: 14px; }

.md-preview :deep(p) { margin: 8px 0; }

.md-preview :deep(code) {
  font-family: var(--font-mono);
  font-size: 12.5px;
  background: var(--blue-tint);
  color: var(--blue-2);
  padding: 1px 6px;
  border-radius: 4px;
}

.md-preview :deep(pre) {
  background: var(--bg-3);
  padding: 12px 14px;
  border-radius: var(--radius-xs);
  overflow-x: auto;
  border: 1px solid var(--line);
}

.md-preview :deep(pre code) {
  background: transparent;
  padding: 0;
  color: var(--ink);
}

.md-preview :deep(ul),
.md-preview :deep(ol) {
  padding-left: 22px;
  margin: 8px 0;
}

.md-preview :deep(li) { margin: 3px 0; }

.md-preview :deep(blockquote) {
  border-left: 3px solid var(--blue-line);
  padding-left: 12px;
  margin: 8px 0;
  color: var(--ink-2);
}
</style>