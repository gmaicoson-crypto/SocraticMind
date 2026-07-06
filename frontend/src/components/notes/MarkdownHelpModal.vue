<template>
  <BaseModal :model-value="show" @close="$emit('close')">
      <div class="md-help-overlay" @click.self="$emit('close')">
        <div class="md-help-modal">
          <div class="md-help-header">
            <div class="md-help-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              Markdown 语法速查
            </div>
            <button class="md-help-close ui-modal-close" @click="$emit('close')">✕</button>
          </div>

          <div class="md-help-body">
            <nav class="md-help-nav">
              <button
                v-for="g in groups"
                :key="g.id"
                class="md-help-nav-item"
                :class="{ active: activeGroup === g.id }"
                @click="activeGroup = g.id"
              >{{ g.label }}</button>
            </nav>
            <div class="md-help-content">
              <div v-for="g in groups" :key="g.id" v-show="activeGroup === g.id">
                <div v-for="(rule, i) in g.rules" :key="i" class="md-rule">
                  <div class="md-rule-title">{{ rule.title }}</div>
                  <div v-if="rule.note" class="md-rule-note">{{ rule.note }}</div>
                  <div class="md-rule-grid">
                    <pre class="md-rule-src">{{ rule.src }}</pre>
                    <div class="md-rule-preview" v-html="rule.html" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
  </BaseModal>
</template>

<script setup lang="ts">
// MarkdownHelpModal 组件，封装局部界面和交互逻辑。
import { ref, computed } from 'vue'
import { marked } from 'marked'
import BaseModal from '../ui/BaseModal.vue'

defineProps<{ show: boolean }>()
defineEmits<{ (e: 'close'): void }>()

interface Rule {
  title: string
  src: string
  note?: string
}
interface Group {
  id: string
  label: string
  rules: (Rule & { html: string })[]
}

function render(src: string): string {
  return marked.parse(src, { breaks: true, gfm: true }) as string
}

const rawGroups: { id: string; label: string; rules: Rule[] }[] = [
  {
    id: 'heading',
    label: '标题',
    rules: [
      { title: '标题 1-6 级', src: '# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6' },
    ],
  },
  {
    id: 'emphasis',
    label: '强调',
    rules: [
      { title: '粗体 / 斜体 / 粗斜体', src: '**粗体** *斜体* ***粗斜体***' },
      { title: '删除线（GFM）', src: '~~删除~~' },
      { title: '行内代码', src: '使用 `console.log()` 输出' },
      { title: '高亮（HTML）', src: '<mark>需要重点记忆</mark>', note: '部分平台支持' },
    ],
  },
  {
    id: 'list',
    label: '列表',
    rules: [
      { title: '无序列表', src: '- 苹果\n- 香蕉\n  - 嵌套项\n  - 嵌套项\n- 樱桃' },
      { title: '有序列表', src: '1. 第一项\n2. 第二项\n3. 第三项' },
      { title: '任务列表（GFM）', src: '- [x] 已完成\n- [ ] 待办\n- [ ] 也可以嵌套\n  - [x] 子任务' },
    ],
  },
  {
    id: 'link',
    label: '链接 / 图片',
    rules: [
      { title: '链接', src: '[Vue 官网](https://vuejs.org)' },
      { title: '自动链接（GFM）', src: '直接粘贴 https://vuejs.org 也会变成链接' },
      { title: '图片', src: '![alt 文字](https://placehold.co/120x60)' },
      { title: '引用式链接', src: '[Vue][vue-doc]\n\n[vue-doc]: https://vuejs.org' },
    ],
  },
  {
    id: 'block',
    label: '块级元素',
    rules: [
      { title: '引用块', src: '> 这是一段引用\n> 可以多行\n>\n> > 还可以嵌套' },
      { title: '分隔线', src: '上面\n\n---\n\n下面' },
      {
        title: '代码块（带语言高亮）',
        src: '```python\ndef hello(name):\n    print(f"Hello, {name}!")\n```',
        note: '在 ``` 后写语言名（python / js / ts / sql / bash …）启用语法高亮',
      },
    ],
  },
  {
    id: 'table',
    label: '表格',
    rules: [
      {
        title: '表格（GFM）',
        src: '| 列 1 | 列 2 | 列 3 |\n| --- | :---: | ---: |\n| 左对齐 | 居中 | 右对齐 |\n| `代码` | **粗** | _斜_ |',
        note: '冒号 : 控制对齐：:--- 左、:---: 中、---: 右',
      },
    ],
  },
  {
    id: 'misc',
    label: '其他',
    rules: [
      {
        title: '换行',
        src: '行末加两个空格  \n会强制换行',
        note: '本编辑器已开启 breaks 选项，单回车也会换行',
      },
      { title: '转义字符', src: '\\*这不是斜体\\*\n\\# 这不是标题' },
      {
        title: '行内 HTML',
        src: '<details>\n<summary>点击展开</summary>\n隐藏内容\n</details>',
        note: '支持原生 HTML 标签，如 details / sup / sub / kbd',
      },
      { title: '上下标 / 键盘键', src: 'X<sup>2</sup> + Y<sub>n</sub>，按 <kbd>Ctrl</kbd>+<kbd>S</kbd>' },
    ],
  },
]

const groups = computed<Group[]>(() =>
  rawGroups.map(g => ({
    ...g,
    rules: g.rules.map(r => ({ ...r, html: render(r.src) })),
  }))
)

const activeGroup = ref(rawGroups[0].id)
</script>

<style scoped>
.md-help-overlay {
  position: fixed;
  inset: 0;
  z-index: 320;
  background: rgba(0,0,0,0.32);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.md-help-modal {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
  width: min(900px, 100%);
  height: min(640px, 100%);
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 48px rgba(0,0,0,0.18);
  overflow: hidden;
}
.md-help-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}
.md-help-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
}
.md-help-title svg {
  color: var(--blue-2);
}
.md-help-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 140px 1fr;
}
.md-help-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 8px;
  border-right: 1px solid var(--line);
  background: var(--bg-2);
  overflow-y: auto;
}
.md-help-nav-item {
  text-align: left;
  padding: 7px 12px;
  font-size: 12.5px;
  font-family: var(--font-sans);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--ink-2);
  cursor: pointer;
  transition: all .15s;
}
.md-help-nav-item:hover {
  background: var(--bg-3);
  color: var(--ink);
}
.md-help-nav-item.active {
  background: var(--surface);
  border-color: var(--blue-line);
  color: var(--blue-2);
  font-weight: 600;
}

.md-help-content {
  padding: 16px 20px;
  overflow-y: auto;
}

.md-rule {
  margin-bottom: 18px;
}
.md-rule:last-child {
  margin-bottom: 0;
}
.md-rule-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
  margin-bottom: 4px;
}
.md-rule-note {
  font-size: 11.5px;
  color: var(--ink-3);
  margin-bottom: 6px;
  line-height: 1.55;
}
.md-rule-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.md-rule-src {
  margin: 0;
  background: var(--bg-3);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 10px 12px;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
  color: var(--ink);
  white-space: pre-wrap;
  word-break: break-word;
}
.md-rule-preview {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--ink);
  overflow: auto;
}

.md-rule-preview :deep(h1) {
  font-size: 16px;
  margin: 4px 0;
  font-weight: 600;
}
.md-rule-preview :deep(h2) {
  font-size: 14px;
  margin: 4px 0;
  font-weight: 600;
}
.md-rule-preview :deep(h3) {
  font-size: 13px;
  margin: 4px 0;
  font-weight: 600;
}
.md-rule-preview :deep(h4) {
  font-size: 12.5px;
  margin: 4px 0;
  font-weight: 600;
}
.md-rule-preview :deep(h5) {
  font-size: 12px;
  margin: 4px 0;
  font-weight: 600;
}
.md-rule-preview :deep(h6) {
  font-size: 11.5px;
  margin: 4px 0;
  font-weight: 600;
  color: var(--ink-2);
}
.md-rule-preview :deep(p) {
  margin: 4px 0;
}
.md-rule-preview :deep(code) {
  font-family: var(--font-mono);
  font-size: 11.5px;
  background: var(--blue-tint);
  color: var(--blue-2);
  padding: 1px 5px;
  border-radius: 3px;
}
.md-rule-preview :deep(pre) {
  background: var(--bg-3);
  padding: 8px 10px;
  border-radius: 5px;
  margin: 4px 0;
  border: 1px solid var(--line);
  overflow-x: auto;
}
.md-rule-preview :deep(pre code) {
  background: transparent;
  padding: 0;
  color: var(--ink);
}
.md-rule-preview :deep(ul),
.md-rule-preview :deep(ol) {
  padding-left: 18px;
  margin: 4px 0;
}
.md-rule-preview :deep(li) {
  margin: 2px 0;
}
.md-rule-preview :deep(blockquote) {
  border-left: 3px solid var(--blue-line);
  padding-left: 8px;
  margin: 4px 0;
  color: var(--ink-2);
}
.md-rule-preview :deep(table) {
  border-collapse: collapse;
  margin: 4px 0;
  font-size: 11.5px;
}
.md-rule-preview :deep(th),
.md-rule-preview :deep(td) {
  border: 1px solid var(--line);
  padding: 4px 8px;
  text-align: left;
}
.md-rule-preview :deep(th) {
  background: var(--bg-3);
  font-weight: 600;
}
.md-rule-preview :deep(hr) {
  border: none;
  border-top: 1px solid var(--line);
  margin: 6px 0;
}
.md-rule-preview :deep(input[type='checkbox']) {
  margin-right: 4px;
}
.md-rule-preview :deep(del) {
  text-decoration: line-through;
  color: var(--ink-3);
}
.md-rule-preview :deep(a) {
  color: var(--blue-2);
  text-decoration: underline;
}
.md-rule-preview :deep(img) {
  max-width: 100%;
  border-radius: 4px;
}
.md-rule-preview :deep(kbd) {
  font-family: var(--font-mono);
  font-size: 11px;
  background: var(--bg-3);
  color: var(--ink);
  padding: 1px 5px;
  border-radius: 3px;
  border: 1px solid var(--line);
  box-shadow: inset 0 -1px 0 var(--line-2);
}

.fade-enter-active, .fade-leave-active {
  transition: opacity .2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
