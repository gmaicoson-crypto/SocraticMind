<template>
  <header class="topbar">
    <!-- Logo -->
    <div class="logo-wrap" style="cursor:pointer" @click="router.push('/')">
      <div class="logo-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="6" r="2.5" fill="white" stroke="none"/>
          <circle cx="6" cy="16" r="2" fill="white" stroke="none"/>
          <circle cx="18" cy="16" r="2" fill="white" stroke="none"/>
          <path d="M12 8 L6 14 M12 8 L18 14 M8 16 H16" />
        </svg>
      </div>
      <div>
        <div class="logo-text">Socratic<span>Mind</span></div>
        <div class="logo-sub">AI Guided Learning</div>
      </div>
    </div>

    <div class="divider" />

    <!-- Search -->
    <div class="search-outer" ref="searchRef">
      <div class="search-wrap" :class="{ focused }">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" stroke-width="2">
          <circle cx="11" cy="11" r="7"/><path d="M21 21 L17 17"/>
        </svg>
        <input
          ref="inputRef"
          v-model="query"
          placeholder="搜索主题或节点…"
          @focus="focused = true; showDropdown = true"
          @blur="onBlur"
          @keydown.escape="closeSearch"
          @keydown.down.prevent="moveDown"
          @keydown.up.prevent="moveUp"
          @keydown.enter.prevent="selectCurrent"
        />
        <span v-if="!query" class="kbd">⌘K</span>
        <button v-else class="clear-btn" @mousedown.prevent @click="clearSearch">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- 下拉结果 -->
      <Transition name="dropdown">
        <div v-if="showDropdown && focused && results.length > 0" class="search-dropdown">
          <!-- 节点结果 -->
          <div v-if="nodeResults.length > 0">
            <div class="dropdown-section">节点</div>
            <div
              v-for="(item, i) in nodeResults"
              :key="item.id"
              class="dropdown-item"
              :class="{ active: activeIndex === i }"
              @mousedown.prevent
              @click="selectNode(item)"
            >
              <div class="item-icon" :class="item.state">
                <svg v-if="item.state === 'mastered'" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M3 8L7 12L13 4"/>
                </svg>
                <svg v-else-if="item.state === 'locked'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <circle cx="12" cy="12" r="4"/>
                </svg>
              </div>
              <div class="item-content">
                <div class="item-title" v-html="highlight(item.label, query)" />
                <div class="item-sub">{{ item.sub }} · {{ stateLabel(item.state) }}</div>
              </div>
              <div class="item-arrow">→</div>
            </div>
          </div>

          <!-- 主题结果 -->
          <div v-if="topicResults.length > 0">
            <div class="dropdown-section">主题</div>
            <div
              v-for="(item, i) in topicResults"
              :key="item.id"
              class="dropdown-item"
              :class="{ active: activeIndex === nodeResults.length + i }"
              @mousedown.prevent
              @click="selectTopic(item)"
            >
              <div class="item-icon topic">
                {{ item.emoji }}
              </div>
              <div class="item-content">
                <div class="item-title" v-html="highlight(item.title, query)" />
                <div class="item-sub">{{ item.mastered }} / {{ item.nodes }} 节点已掌握</div>
              </div>
              <div class="item-arrow">→</div>
            </div>
          </div>
        </div>
      </Transition>

      <!-- 无结果 -->
      <Transition name="dropdown">
        <div v-if="showDropdown && focused && query && results.length === 0" class="search-dropdown">
          <div class="no-result">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" stroke-width="1.5">
              <circle cx="11" cy="11" r="7"/><path d="M21 21 L17 17"/>
            </svg>
            <span>没有找到「{{ query }}」相关内容</span>
          </div>
        </div>
      </Transition>
    </div>

    <div style="flex: 1" />

    <!-- Progress -->
    <div class="progress-wrap">
      <div class="progress-label">
        <span>进度</span>
        <span class="progress-count">{{ store.masteredCount }} / {{ store.totalCount }} 节点</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" :style="{ width: pct + '%' }" />
      </div>
    </div>

    <div class="divider" />

    <!-- Profile -->
    <div class="profile-wrap" style="cursor:pointer" @click="router.push('/profile')">
      <div class="profile-info">
        <div class="profile-name">{{ store.userInfo?.username ?? '学习者' }}</div>
        <div class="profile-level">◆ APPRENTICE · LV 4</div>
      </div>
      <div class="avatar" :style="{ background: store.userInfo?.avatar_grad }">
        {{ store.userInfo?.username?.slice(0,1) ?? '学' }}
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useLearningStore } from '../stores/learning'
import type { KNode, Topic } from '../types'

const store = useLearningStore()
const router = useRouter()
const query = ref('')
const focused = ref(false)
const showDropdown = ref(false)
const activeIndex = ref(-1)
const inputRef = ref<HTMLInputElement | null>(null)

const pct = computed(() => Math.round((store.masteredCount / store.totalCount) * 100))

// 搜索结果
const nodeResults = computed(() => {
  if (!query.value.trim()) return []
  const q = query.value.toLowerCase()
  return store.nodes.filter(n =>
    n.label.toLowerCase().includes(q) || n.sub.toLowerCase().includes(q)
  ).slice(0, 5)
})

const topicResults = computed(() => {
  if (!query.value.trim()) return []
  const q = query.value.toLowerCase()
  return store.topics.filter(t =>
    t.title.toLowerCase().includes(q)
  ).slice(0, 3)
})

const results = computed(() => [...nodeResults.value, ...topicResults.value])

// 高亮匹配文字
function highlight(text: string, q: string) {
  if (!q) return text
  const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  return text.replace(regex, '<mark>$1</mark>')
}

function stateLabel(state: string) {
  return { mastered: '已掌握', available: '可学习', locked: '已锁定' }[state] || state
}

// 键盘导航
function moveDown() {
  activeIndex.value = Math.min(activeIndex.value + 1, results.value.length - 1)
}

function moveUp() {
  activeIndex.value = Math.max(activeIndex.value - 1, -1)
}

function selectCurrent() {
  if (activeIndex.value < 0) return
  const i = activeIndex.value
  if (i < nodeResults.value.length) {
    selectNode(nodeResults.value[i])
  } else {
    selectTopic(topicResults.value[i - nodeResults.value.length])
  }
}

// 选择节点
function selectNode(node: KNode) {
  store.setActiveNode(node)
  store.setActiveTopic('py') // 跳转到对应主题
  router.push('/')
  closeSearch()
}

// 选择主题
function selectTopic(topic: Topic) {
  store.setActiveTopic(topic.id)
  router.push('/')
  closeSearch()
}

function closeSearch() {
  query.value = ''
  focused.value = false
  showDropdown.value = false
  activeIndex.value = -1
  inputRef.value?.blur()
}

function clearSearch() {
  query.value = ''
  activeIndex.value = -1
  inputRef.value?.focus()
}

function onBlur() {
  setTimeout(() => {
    focused.value = false
    showDropdown.value = false
    activeIndex.value = -1
  }, 150)
}

// ⌘K 快捷键
function handleKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    inputRef.value?.focus()
    showDropdown.value = true
  }
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
</script>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 18px;
  height: 60px;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
  position: relative;
  z-index: 100;
}
.logo-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}
.logo-icon {
  width: 30px; height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--blue), var(--blue-2));
  border-radius: 9px;
  box-shadow: 0 2px 8px oklch(0.72 0.085 235 / 0.3);
}
.logo-text {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--ink);
}
.logo-text span { color: var(--blue-2); }
.logo-sub {
  font-size: 9.5px;
  color: var(--ink-3);
  font-family: var(--font-mono);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-top: -1px;
}
.divider {
  width: 1px; height: 28px;
  background: var(--line);
}

/* Search */
.search-outer {
  flex: 1;
  max-width: 460px;
  position: relative;
}
.search-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 7px 12px;
  transition: border-color .15s, box-shadow .15s;
}
.search-wrap.focused {
  border-color: var(--blue);
  box-shadow: 0 0 0 3px oklch(0.72 0.085 235 / 0.15);
  background: var(--surface);
}
.search-wrap input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 12.5px;
  color: var(--ink);
  font-family: var(--font-sans);
}
.search-wrap input::placeholder { color: var(--ink-3); }
.kbd {
  font-size: 10px;
  font-family: var(--font-mono);
  color: var(--ink-3);
  background: var(--bg-3);
  border: 1px solid var(--line);
  padding: 1px 5px;
  border-radius: 4px;
  white-space: nowrap;
}
.clear-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--ink-3);
  padding: 0;
  display: flex;
  align-items: center;
  border-radius: 4px;
  transition: color .15s;
}
.clear-btn:hover { color: var(--ink); }

/* Dropdown */
.search-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0; right: 0;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 8px 30px oklch(0.5 0.04 235 / 0.12);
  overflow: hidden;
  z-index: 200;
}

.dropdown-section {
  font-size: 10px;
  font-weight: 600;
  color: var(--ink-3);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-family: var(--font-mono);
  padding: 8px 12px 4px;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background .1s;
}
.dropdown-item:hover,
.dropdown-item.active {
  background: var(--blue-tint);
}

.item-icon {
  width: 28px; height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 14px;
}
.item-icon.mastered {
  background: var(--blue-soft);
  color: var(--blue-2);
}
.item-icon.available {
  background: var(--bg-2);
  color: var(--blue);
  border: 1px solid var(--blue-line);
}
.item-icon.locked {
  background: var(--bg-3);
  color: var(--ink-3);
}
.item-icon.topic {
  background: var(--bg-2);
}

.item-content { flex: 1; min-width: 0; }

.item-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.item-title :deep(mark) {
  background: oklch(0.72 0.085 235 / 0.2);
  color: var(--blue-2);
  border-radius: 2px;
  padding: 0 1px;
}

.item-sub {
  font-size: 11px;
  color: var(--ink-3);
  margin-top: 1px;
  font-family: var(--font-mono);
}

.item-arrow {
  font-size: 12px;
  color: var(--ink-3);
  flex-shrink: 0;
}

.no-result {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 12px;
  font-size: 12.5px;
  color: var(--ink-3);
}

/* Transition */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity .15s ease, transform .15s ease;
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* Progress */
.progress-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 170px;
}
.progress-label {
  display: flex;
  justify-content: space-between;
  font-size: 10.5px;
  color: var(--ink-3);
  font-family: var(--font-mono);
}
.progress-count { color: var(--ink-2); font-weight: 600; }
.progress-track {
  height: 6px;
  border-radius: 999px;
  background: var(--bg-3);
  border: 1px solid var(--line);
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--blue), var(--blue-2));
  border-radius: 999px;
  transition: width .4s ease;
}

/* Profile */
.profile-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 8px;
  border-radius: 10px;
  transition: background .15s;
}
.profile-wrap:hover { background: var(--bg-2); }
.profile-info { text-align: right; }
.profile-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink);
}
.profile-level {
  font-size: 10px;
  color: var(--blue-2);
  font-family: var(--font-mono);
  letter-spacing: 0.05em;
  margin-top: 1px;
}
.avatar {
  width: 36px; height: 36px;
  background: linear-gradient(135deg, oklch(0.85 0.06 60), oklch(0.7 0.10 35));
  color: white;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
}
</style>