<template>
  <div class="message-list-shell">
    <Transition name="scroll-btn">
      <button
        v-if="showScrollBtn"
        class="scroll-to-bottom"
        title="滚动到底部"
        @click="scrollToBottom"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    </Transition>

    <div ref="scrollRef" class="dlg-messages" @scroll="onMessagesScroll">
      <!-- Vue v-memo codegen needs the parentheses around this key. -->
      <!-- prettier-ignore-attribute :key -->
      <MessageItem
        v-for="(msg, i) in messages"
        :key="(msg.db_id ?? `${msg.role}-${msg.time}-${i}`)"
        v-memo="[
          msg.text,
          msg.quote,
          msg.quote_source_db_id,
          msg.quote_source_local_id,
          findQuoteIndex(msg),
          msg.time,
          msg.selected_choice,
          avatarUrl,
          aiAvatarUrl,
          isThinking,
          i === messages.length - 1,
          i === retryableIndex,
          highlightedIndex === i,
        ]"
        :message="msg"
        :index="i"
        :data-message-index="i"
        :class="{ 'quote-target': highlightedIndex === i }"
        :is-last="i === messages.length - 1"
        :is-thinking="isThinking"
        :can-retry="i === retryableIndex"
        :can-jump-to-quote="findQuoteIndex(msg) !== -1"
        :avatar-url="avatarUrl"
        :ai-avatar-url="aiAvatarUrl"
        @delete="$emit('delete', i)"
        @retry="$emit('retry', i)"
        @quote="$emit('quote', msg)"
        @jump-to-quote="jumpToQuote(msg)"
        @change-ai-avatar="$emit('change-ai-avatar')"
        @select-choice="$emit('select-choice', $event)"
      />

      <slot name="agent" />

      <div v-if="streamingText" class="msg-row ai">
        <button
          type="button"
          class="ai-avatar sm"
          title="更改此对话的 AI 头像"
          aria-label="更改此对话的 AI 头像"
          @click="$emit('change-ai-avatar')"
        >
          <img :src="avatarSrc(aiAvatarUrl)" alt="" class="ui-avatar-image ai-avatar-image" />
        </button>
        <div class="msg-content ai">
          <div class="bubble ai">
            <InlineMarkdown :text="displayStreamingText" :with-caret="true" />
          </div>
          <div v-if="streamingChoices && streamingChoices.length" class="choices-row">
            <button
              v-for="c in streamingChoices"
              :key="c.label"
              class="choice-btn"
              @click="$emit('select-choice', c.label + '. ' + c.text)"
            >
              <span class="choice-label">{{ c.label }}</span>
              <span class="choice-text">{{ c.text }}</span>
            </button>
          </div>
        </div>
      </div>

      <div v-if="isThinking && !streamingText" class="msg-row ai">
        <button
          type="button"
          class="ai-avatar sm"
          title="更改此对话的 AI 头像"
          aria-label="更改此对话的 AI 头像"
          @click="$emit('change-ai-avatar')"
        >
          <img :src="avatarSrc(aiAvatarUrl)" alt="" class="ui-avatar-image ai-avatar-image" />
        </button>
        <div
          class="bubble ai"
          style="display: flex; gap: 4px; align-items: center; padding: 12px 14px"
        >
          <span class="dot" style="animation-delay: 0ms" />
          <span class="dot" style="animation-delay: 150ms" />
          <span class="dot" style="animation-delay: 300ms" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// MessageList 组件，封装局部界面和交互逻辑。
import { ref, computed, nextTick, onBeforeUnmount } from 'vue'
import type { Message } from '../../types'
import { avatarSrc } from '../../utils/avatar'
import { retryableAiIndex } from '../../utils/chat'
import InlineMarkdown from './InlineMarkdown.vue'
import MessageItem from './MessageItem.vue'

defineEmits<{
  (e: 'delete', index: number): void
  (e: 'retry', index: number): void
  (e: 'quote', msg: Message): void
  (e: 'change-ai-avatar'): void
  (e: 'select-choice', text: string): void
}>()

const props = defineProps<{
  messages: Message[]
  streamingText: string
  streamingChoices?: { label: string; text: string }[] | null
  isThinking: boolean
  avatarUrl: string | null
  aiAvatarUrl: string
}>()

const displayStreamingText = computed(() => {
  let text = props.streamingText

  text = text.replace(/\s*\[CHOICES\][\s\S]*?\[ECHOICES\]\s*/g, '')

  const idx = text.indexOf('[CHOICES]')
  if (idx !== -1) text = text.slice(0, idx)
  return text
})

const retryableIndex = computed(() => retryableAiIndex(props.messages))
const quoteTargets = computed(() => {
  const dbIds = new Map<number, number>()
  const localIds = new Map<string, number>()
  props.messages.forEach((message, index) => {
    if (message.role !== 'ai') return
    if (message.db_id != null) dbIds.set(message.db_id, index)
    if (message.local_id) localIds.set(message.local_id, index)
  })
  return { dbIds, localIds }
})

function findQuoteIndex(message: Message): number {
  if (message.quote_source_db_id != null) {
    const index = quoteTargets.value.dbIds.get(message.quote_source_db_id)
    if (index != null) return index
  }
  if (message.quote_source_local_id) {
    return quoteTargets.value.localIds.get(message.quote_source_local_id) ?? -1
  }
  return -1
}

const scrollRef = ref<HTMLElement | null>(null)
const showScrollBtn = ref(false)
const highlightedIndex = ref(-1)
let highlightTimer: ReturnType<typeof setTimeout> | null = null

function jumpToQuote(message: Message) {
  const index = findQuoteIndex(message)
  if (index < 0) return
  const target = scrollRef.value?.querySelector<HTMLElement>(`[data-message-index="${index}"]`)
  target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  highlightedIndex.value = index
  if (highlightTimer) clearTimeout(highlightTimer)
  highlightTimer = setTimeout(() => (highlightedIndex.value = -1), 1800)
}

let scrollFrame: number | null = null
function onMessagesScroll() {
  if (scrollFrame !== null) return
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = null
    if (!scrollRef.value) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.value
    showScrollBtn.value = scrollHeight - scrollTop - clientHeight > 80
  })
}

function scrollToBottom() {
  nextTick(() => {
    if (scrollRef.value) scrollRef.value.scrollTop = scrollRef.value.scrollHeight
  })
}

onBeforeUnmount(() => {
  if (scrollFrame !== null) cancelAnimationFrame(scrollFrame)
  if (highlightTimer) clearTimeout(highlightTimer)
})

defineExpose({ scrollToBottom })
</script>

<style scoped>
.message-list-shell {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
}

.dlg-messages {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: 14px;
  padding: 16px 20px;
  overflow-y: auto;
  background: var(--bg);
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ink-3);
  animation: dot 1.2s infinite;
}

@keyframes dot {
  0%,
  80%,
  100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  40% {
    opacity: 1;
    transform: scale(1);
  }
}

.scroll-to-bottom {
  position: absolute;
  right: 18px;
  bottom: 12px;
  z-index: 10;
  display: flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: var(--surface);
  box-shadow: var(--control-shadow);
  color: var(--ink-2);
  cursor: pointer;
  transition:
    background var(--transition-fast),
    color var(--transition-fast),
    box-shadow var(--transition-fast);
}

.scroll-to-bottom:hover {
  border-color: var(--blue-line);
  background: var(--blue-tint);
  color: var(--blue-2);
}

.scroll-btn-enter-active,
.scroll-btn-leave-active {
  transition:
    opacity 0.2s,
    transform 0.2s;
}

.scroll-btn-enter-from,
.scroll-btn-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
