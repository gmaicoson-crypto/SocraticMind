<template>
  <div class="message-list-shell" :style="{ '--message-overlay-height': `${overlayHeight}px` }">
    <Transition name="scroll-btn">
      <button
        v-if="showScrollBtn"
        class="scroll-to-bottom"
        title="滚动到底部"
        @click="scrollToBottom(true)"
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

    <div
      ref="scrollRef"
      class="dlg-messages"
      @scroll="onMessagesScroll"
      @wheel.passive="onMessagesWheel"
    >
      <!-- Vue v-memo codegen needs the parentheses around this key. -->
      <!-- prettier-ignore-attribute :key -->
      <MessageItem
        v-for="(msg, i) in visibleMessages"
        :key="(msg.db_id ?? `${msg.role}-${msg.time}-${visibleMessageIndexes[i]}`)"
        v-memo="[
          msg.text,
          msg.attachments,
          msg.choices,
          msg.metadata?.web,
          msg.metadata?.status,
          msg.quote,
          msg.quote_source_db_id,
          msg.quote_source_local_id,
          findQuoteIndex(msg),
          msg.time,
          msg.selected_choice,
          avatarUrl,
          aiAvatarUrl,
          isThinking,
          chatDisabled,
          visibleMessageIndexes[i] === messages.length - 1,
          visibleMessageIndexes[i] === retryableIndex,
          highlightedIndex === visibleMessageIndexes[i],
        ]"
        :message="msg"
        :index="visibleMessageIndexes[i]"
        :data-message-index="visibleMessageIndexes[i]"
        :class="{ 'quote-target': highlightedIndex === visibleMessageIndexes[i] }"
        :is-last="visibleMessageIndexes[i] === messages.length - 1"
        :is-thinking="isThinking"
        :chat-disabled="chatDisabled"
        :can-retry="visibleMessageIndexes[i] === retryableIndex"
        :can-jump-to-quote="findQuoteIndex(msg) !== -1"
        :avatar-url="avatarUrl"
        :ai-avatar-url="aiAvatarUrl"
        @delete="$emit('delete', visibleMessageIndexes[i])"
        @retry="$emit('retry', visibleMessageIndexes[i])"
        @quote="$emit('quote', msg)"
        @jump-to-quote="jumpToQuote(msg)"
        @change-ai-avatar="$emit('change-ai-avatar')"
        @select-choice="$emit('select-choice', $event)"
      />

      <slot name="agent" />

      <div v-if="isThinking || hasStreamingContent" class="msg-row ai">
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
          <div v-if="displayStreamingText.trim()" class="bubble ai">
            <InlineMarkdown
              :text="displayStreamingText"
              :with-caret="isThinking"
              :assistant="true"
              :web="streamingWeb"
            />
          </div>
          <div
            v-else-if="!streamingChoices?.length"
            class="bubble ai thinking-bubble"
            role="status"
            aria-label="正在等待回复"
          >
            <span class="dot" style="animation-delay: 0ms" />
            <span class="dot" style="animation-delay: 150ms" />
            <span class="dot" style="animation-delay: 300ms" />
          </div>
          <MessageSources :web="streamingWeb" :pending="isThinking" />
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
    </div>
    <div v-if="$slots.overlay" ref="overlayRef" class="message-overlay">
      <slot name="overlay" />
    </div>
  </div>
</template>

<script setup lang="ts">
// MessageList 组件，封装局部界面和交互逻辑。
import { ref, computed, nextTick, onBeforeUnmount, watch } from 'vue'
import type { Message } from '../../types'
import type { WebSnapshot } from '../../types/webSearch'
import MessageSources from './MessageSources.vue'
import { avatarSrc } from '../../utils/avatar'
import { hasMessageContent, replyUserIndex, retryableAiIndex } from '../../utils/chat'
import { SOCRATIC_WELCOME_TEXT } from '../../composables/useChatSessions'
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
  streamingMessageId?: number
  replacingMessageIndex?: number
  streamingWeb?: WebSnapshot
  streamingChoices?: { label: string; text: string }[] | null
  isThinking: boolean
  chatDisabled?: boolean
  retryUserIndex?: number
  avatarUrl: string | null
  aiAvatarUrl: string
  hideWelcome?: boolean
}>()

const displayStreamingText = computed(() => {
  let text = props.streamingText

  text = text.replace(/\s*\[CHOICES\][\s\S]*?\[ECHOICES\]\s*/g, '')

  const idx = text.indexOf('[CHOICES]')
  if (idx !== -1) text = text.slice(0, idx)
  return text
})
const hasStreamingContent = computed(() =>
  hasMessageContent({
    text: displayStreamingText.value,
    choices: props.streamingChoices ?? undefined,
  }),
)

const visibleMessageIndexes = computed(() =>
  props.messages.flatMap((message, index) => {
    if (message.messageType && message.messageType !== 'chat') return []
    if (message.role === 'ai' && !hasMessageContent(message)) return []
    if (
      props.isThinking &&
      message.role === 'ai' &&
      (index === props.replacingMessageIndex ||
        (message.db_id != null && message.db_id === props.streamingMessageId))
    )
      return []
    if (props.hideWelcome && message.role === 'ai' && message.text === SOCRATIC_WELCOME_TEXT) {
      return []
    }
    return [index]
  }),
)
const visibleMessages = computed(() =>
  visibleMessageIndexes.value.map((index) => props.messages[index]),
)
const retryableIndex = computed(() => {
  if (props.chatDisabled) return -1
  if (props.retryUserIndex != null) return props.retryUserIndex
  const aiIndex = retryableAiIndex(props.messages)
  const reply = props.messages[aiIndex]
  if (
    reply &&
    (!hasMessageContent(reply) ||
      reply.metadata?.status === 'failed' ||
      reply.metadata?.status === 'interrupted')
  ) {
    const userIndex = replyUserIndex(props.messages, aiIndex)
    if (userIndex >= 0) return userIndex
  }
  return aiIndex
})
const quoteTargets = computed(() => {
  const dbIds = new Map<number, number>()
  const localIds = new Map<string, number>()
  visibleMessages.value.forEach((message, index) => {
    if (message.role !== 'ai') return
    const originalIndex = visibleMessageIndexes.value[index]
    if (message.db_id != null) dbIds.set(message.db_id, originalIndex)
    if (message.local_id) localIds.set(message.local_id, originalIndex)
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
const overlayRef = ref<HTMLElement | null>(null)
const overlayHeight = ref(0)
let overlayResizeObserver: ResizeObserver | null = null
const showScrollBtn = ref(false)
const bottomThreshold = 4
let followingLatest = true
let lastScrollTop = 0
let bottomScrollPending = false
const highlightedIndex = ref(-1)
let highlightTimer: ReturnType<typeof setTimeout> | null = null

function jumpToQuote(message: Message) {
  const index = findQuoteIndex(message)
  if (index < 0) return
  const target = scrollRef.value?.querySelector<HTMLElement>(`[data-message-index="${index}"]`)
  followingLatest = false
  target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  highlightedIndex.value = index
  if (highlightTimer) clearTimeout(highlightTimer)
  highlightTimer = setTimeout(() => (highlightedIndex.value = -1), 1800)
}

let scrollFrame: number | null = null
function onMessagesScroll() {
  const el = scrollRef.value
  if (!el) return
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= bottomThreshold
  // Pause immediately so a queued stream update cannot undo the user's scroll.
  if (el.scrollTop < lastScrollTop && !atBottom) followingLatest = false
  else if (atBottom) followingLatest = true
  lastScrollTop = el.scrollTop
  if (scrollFrame !== null) return
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = null
    if (!scrollRef.value) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.value
    showScrollBtn.value = scrollHeight - scrollTop - clientHeight > bottomThreshold
  })
}

function onMessagesWheel(event: WheelEvent) {
  if (event.deltaY < 0 && (scrollRef.value?.scrollTop ?? 0) > 0) followingLatest = false
}

function scrollToBottom(force = false) {
  if (force) followingLatest = true
  if (!followingLatest || bottomScrollPending) return
  bottomScrollPending = true
  nextTick(() => {
    bottomScrollPending = false
    const el = scrollRef.value
    if (!followingLatest || !el) return
    el.scrollTop = el.scrollHeight
    lastScrollTop = el.scrollTop
    showScrollBtn.value = false
  })
}

watch(
  overlayRef,
  (element) => {
    overlayResizeObserver?.disconnect()
    overlayResizeObserver = null
    const measureOverlay = () => {
      const height = element?.getBoundingClientRect().height ?? 0
      if (height === overlayHeight.value) return
      overlayHeight.value = height
      scrollToBottom()
    }
    measureOverlay()
    if (element && typeof ResizeObserver !== 'undefined') {
      overlayResizeObserver = new ResizeObserver(measureOverlay)
      overlayResizeObserver.observe(element)
    }
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  overlayResizeObserver?.disconnect()
  if (scrollFrame !== null) cancelAnimationFrame(scrollFrame)
  if (highlightTimer) clearTimeout(highlightTimer)
})

defineExpose({ scrollToBottom })
</script>

<style scoped>
.message-list-shell {
  position: relative;
  isolation: isolate;
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
  padding-bottom: calc(16px + var(--message-overlay-height, 0px));
  scroll-padding-bottom: calc(16px + var(--message-overlay-height, 0px));
  overflow-y: auto;
  background: var(--bg);
}

.message-overlay {
  position: absolute;
  inset: auto 0 0;
  z-index: 2;
  background: transparent;
  pointer-events: none;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ink-3);
  animation: dot 1.2s infinite;
}

.thinking-bubble {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 12px 14px;
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
  bottom: calc(12px + var(--message-overlay-height, 0px));
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
