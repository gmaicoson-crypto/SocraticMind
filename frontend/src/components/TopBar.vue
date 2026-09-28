<template>
  <header class="topbar">
    <div class="logo-wrap" style="cursor: pointer" @click="router.push('/')">
      <div class="logo-icon">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--on-accent)"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="6" r="2.5" fill="var(--on-accent)" stroke="none" />
          <circle cx="6" cy="16" r="2" fill="var(--on-accent)" stroke="none" />
          <circle cx="18" cy="16" r="2" fill="var(--on-accent)" stroke="none" />
          <path d="M12 8 L6 14 M12 8 L18 14 M8 16 H16" />
        </svg>
      </div>
      <div>
        <div class="logo-text">Socratic<span>Mind</span></div>
        <div class="logo-sub">AI Guided Learning</div>
      </div>
    </div>

    <div class="divider" />

    <div class="search-outer" ref="searchRef">
      <div class="search-wrap" :class="{ focused }">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--ink-3)"
          stroke-width="2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21 L17 17" />
        </svg>
        <input
          ref="inputRef"
          v-model="query"
          placeholder="搜索主题或节点…"
          @focus="
            () => {
              focused = true
              showDropdown = true
            }
          "
          @blur="onBlur"
          @keydown.escape="closeSearch"
          @keydown.down.prevent="moveDown"
          @keydown.up.prevent="moveUp"
          @keydown.enter.prevent="selectCurrent"
        />
        <span v-if="!query" class="kbd">⌘K</span>
        <button v-else class="clear-btn" @mousedown.prevent @click="clearSearch">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <Transition name="dropdown">
        <div v-if="showDropdown && focused && results.length > 0" class="search-dropdown">
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
                <svg
                  v-if="item.state === 'mastered'"
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                >
                  <path d="M3 8L7 12L13 4" />
                </svg>
                <svg
                  v-else-if="item.state === 'locked'"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <svg
                  v-else
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                >
                  <circle cx="12" cy="12" r="4" />
                </svg>
              </div>
              <div class="item-content">
                <div class="item-title" v-html="highlight(item.label, query)" />
                <div class="item-sub">
                  <span v-html="highlight(item.sub || item.topic_title, query)" />
                  · {{ item.topic_emoji }} {{ item.topic_title }} · {{ stateLabel(item.state) }}
                </div>
              </div>
              <div class="item-arrow">→</div>
            </div>
          </div>

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

      <Transition name="dropdown">
        <div
          v-if="showDropdown && focused && query && results.length === 0"
          class="search-dropdown"
        >
          <div class="no-result">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--ink-3)"
              stroke-width="1.5"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21 L17 17" />
            </svg>
            <span>没有找到「{{ query }}」相关内容</span>
          </div>
        </div>
      </Transition>
    </div>

    <div style="flex: 1" />

    <TopBarProgress :mastered="store.masteredCount" :total="store.totalCount" />

    <div class="divider" />

    <TopBarProfile
      :username="store.userInfo?.username"
      :avatar-url="store.userInfo?.avatar_url"
      :avatar-grad="store.userInfo?.avatar_grad"
      :level="userLevel"
      @open="router.push('/profile')"
    />
  </header>
</template>

<script setup lang="ts">
// TopBar 组件，封装局部界面和交互逻辑。
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useLearningStore } from '../stores/learning'
import { getProfileStats } from '../api/progress'
import { computeLevel } from '../utils/level'
import { highlight } from '../utils/highlight'
import { useGlobalSearch } from '../composables/useGlobalSearch'
import TopBarProgress from './navigation/TopBarProgress.vue'
import TopBarProfile from './navigation/TopBarProfile.vue'

const store = useLearningStore()
const router = useRouter()
const chatCount = ref(0)
const userLevel = computed(() => computeLevel(chatCount.value))
const {
  query,
  focused,
  showDropdown,
  activeIndex,
  inputRef,
  nodeResults,
  topicResults,
  results,
  closeSearch,
  clearSearch,
  onBlur,
  moveDown,
  moveUp,
  selectCurrent,
  selectNode,
  selectTopic,
  stateLabel,
} = useGlobalSearch()
void inputRef

onMounted(async () => {
  try {
    const stats = await getProfileStats()
    chatCount.value = stats.chat_count
  } catch (err) {
    console.warn('加载用户等级失败', err)
  }
})
</script>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 18px;
  height: 60px;
  background: var(--topbar-bg);
  border-bottom: 1px solid var(--topbar-border);
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
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--logo-bg);
  border-radius: 9px;
  box-shadow: var(--logo-shadow);
}
.logo-text {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--ink);
}
.logo-text span {
  color: var(--blue-2);
}
.logo-sub {
  font-size: 9.5px;
  color: var(--ink-3);
  font-family: var(--font-mono);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-top: -1px;
}
.divider {
  width: 1px;
  height: 28px;
  background: var(--line);
}

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
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.search-wrap.focused {
  border-color: var(--blue);
  box-shadow: var(--search-focus-shadow);
  background: var(--search-focus-bg);
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
.search-wrap input::placeholder {
  color: var(--ink-3);
}
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
  transition: color 0.15s;
}
.clear-btn:hover {
  color: var(--ink);
}

.search-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: var(--dropdown-shadow);
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
  transition: background 0.1s;
}
.dropdown-item:hover,
.dropdown-item.active {
  background: var(--blue-tint);
}

.item-icon {
  width: 28px;
  height: 28px;
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

.item-content {
  flex: 1;
  min-width: 0;
}

.item-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.item-title :deep(mark) {
  background: var(--highlight-bg);
  color: var(--highlight-text);
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

.dropdown-enter-active,
.dropdown-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

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
.progress-count {
  color: var(--ink-2);
  font-weight: 600;
}
.progress-track {
  height: 6px;
  border-radius: 999px;
  background: var(--bg-3);
  border: 1px solid var(--line);
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: var(--progress-gradient);
  border-radius: 999px;
  transition: width 0.4s ease;
}

.profile-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 8px;
  border-radius: 10px;
  transition: background 0.15s;
}
.profile-wrap:hover {
  background: var(--bg-2);
}
.profile-info {
  text-align: right;
}
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
  width: 36px;
  height: 36px;
  background: var(--avatar-bg);
  color: var(--on-accent);
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  overflow: hidden;
}
.avatar .avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
@media (max-width: 760px) {
  .topbar {
    height: 52px;
    gap: 8px;
    padding: 0 10px;
  }
  .logo-wrap {
    min-width: 0;
  }
  .logo-text {
    font-size: 13px;
  }
  .logo-sub,
  .search-outer,
  .topbar > .divider,
  .topbar :deep(.progress-wrap) {
    display: none;
  }
  .topbar > div[style] {
    min-width: 0;
  }
  .topbar :deep(.profile-info) {
    display: none;
  }
  .topbar :deep(.profile-wrap) {
    padding: 2px;
  }
  .topbar :deep(.avatar) {
    width: 32px;
    height: 32px;
    border-radius: 8px;
  }
}
</style>
