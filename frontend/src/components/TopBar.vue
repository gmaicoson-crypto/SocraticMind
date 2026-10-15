<template>
  <header class="topbar">
    <RouterLink class="logo-wrap" to="/">
      <img
        class="logo-image"
        :src="
          store.isDark
            ? '/branding/socraticmind-dark-transparent.webp'
            : '/branding/socraticmind-light-transparent.webp'
        "
        alt="SocraticMind"
        width="2000"
        height="650"
      />
    </RouterLink>

    <div class="divider" />

    <div class="search-outer" ref="searchRef">
      <div class="search-wrap" :class="{ focused }">
        <Search :size="14" aria-hidden="true" />
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
        <button v-else class="clear-btn ui-icon-button" @mousedown.prevent @click="clearSearch">
          <X :size="12" aria-hidden="true" />
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
                <Check v-if="item.state === 'mastered'" :size="12" aria-hidden="true" />
                <LockKeyhole v-else-if="item.state === 'locked'" :size="12" aria-hidden="true" />
                <Circle v-else :size="12" aria-hidden="true" />
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
            <Search :size="18" aria-hidden="true" />
            <span>没有找到「{{ query }}」相关内容</span>
          </div>
        </div>
      </Transition>
    </div>

    <div class="topbar-spacer" />

    <div class="topbar-account-area">
      <TopBarProgress
        :mastered="store.overallProgress.mastered"
        :total="store.overallProgress.total"
      />
      <TopBarProfile
        :username="store.userInfo?.username"
        :avatar-url="store.userInfo?.avatar_url"
        :level="userLevel"
        @open="router.push('/profile')"
      />
    </div>
  </header>
</template>

<script setup lang="ts">
import { Check, Circle, LockKeyhole, Search, X } from '@lucide/vue'
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
  flex-shrink: 0;
  text-decoration: none;
}
.logo-image {
  display: block;
  width: 200px;
  height: 52px;
  object-fit: cover;
}
.divider {
  width: 1px;
  height: 28px;
  flex-shrink: 0;
  background: var(--line);
}

.topbar-spacer {
  flex: 1;
  min-width: 0;
}

.topbar-account-area {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 24px;
}

.search-outer {
  flex: 1 1 260px;
  min-width: 0;
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
  min-width: 0;
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
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  transition: color 0.15s;
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
  --icon-color: currentColor;
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

@media (max-width: 900px) {
  .topbar {
    gap: 12px;
  }

  .kbd {
    display: none;
  }

  .topbar-account-area {
    gap: 16px;
  }
}

@media (max-width: 760px) {
  .topbar {
    height: 52px;
    gap: 8px;
    padding: 0 10px;
  }
  .logo-image {
    width: 160px;
    height: 44px;
  }
  .search-outer,
  .topbar > .divider {
    display: none;
  }
}
</style>
