<template>
  <div
    class="msg-row"
    :class="message.role"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
  >
    <div v-if="message.role === 'ai'" class="ai-avatar sm">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path
          d="M12 2 L13.5 8.5 L20 10 L13.5 11.5 L12 18 L10.5 11.5 L4 10 L10.5 8.5 Z"
          fill="var(--on-accent)"
        />
      </svg>
    </div>
    <div v-else class="user-avatar" :style="avatarUrl ? {} : { background: avatarGrad }">
      <img
        v-if="avatarUrl"
        :src="avatarSrc(avatarUrl)"
        alt="avatar"
        class="user-avatar-img"
        decoding="async"
      />
      <template v-else>{{ userInitial }}</template>
    </div>

    <div class="msg-content" :class="message.role">
      <div v-if="message.quote" class="msg-quote">
        <span class="quote-bar" />
        <span class="quote-text">{{ message.quote }}</span>
      </div>
      <div class="bubble" :class="message.role">
        <InlineMarkdown :text="message.text" :with-caret="false" />
      </div>

      <div
        v-if="message.choices?.length && message.role === 'ai' && (!isLast || !isThinking)"
        class="choices-row"
        :class="{ historical: !isLast }"
      >
        <button
          v-for="choice in message.choices"
          :key="choice.label"
          class="choice-btn"
          :class="{ selected: message.selected_choice === choice.label }"
          :disabled="!isLast || isThinking"
          @click="emit('select-choice', `${choice.label}. ${choice.text}`)"
        >
          <span class="choice-label">{{ choice.label }}</span>
          <span class="choice-text">{{ choice.text }}</span>
        </button>
      </div>

      <div class="msg-actions" :class="{ visible: hovered }">
        <span class="msg-time"
          >{{ message.role === 'ai' ? 'Socrates AI' : '你' }} · {{ message.time }}</span
        >
        <div class="action-btns">
          <button v-if="index > 0" class="action-btn delete" title="删除" @click="emit('delete')">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
            </svg>
          </button>
          <button
            v-if="message.role === 'ai' && !isThinking"
            class="action-btn"
            title="重新回答"
            @click="emit('retry')"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <path d="M1 4v6h6M23 20v-6h-6" />
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
            </svg>
          </button>
          <button
            v-if="message.role === 'ai'"
            class="action-btn"
            title="引用追问"
            @click="emit('quote')"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          <button class="action-btn" :title="copied ? '已复制' : '复制'" @click="copyMessage">
            <svg
              v-if="!copied"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <svg
              v-else
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--blue-2)"
              stroke-width="2"
              stroke-linecap="round"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import type { Message } from '../../types'
import { avatarSrc } from '../../utils/avatar'
import InlineMarkdown from './InlineMarkdown.vue'

const props = defineProps<{
  message: Message
  index: number
  isLast: boolean
  isThinking: boolean
  userInitial: string
  avatarUrl: string | null
  avatarGrad: string
}>()

const emit = defineEmits<{
  delete: []
  retry: []
  quote: []
  'select-choice': [text: string]
}>()

const hovered = ref(false)
const copied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | null = null

async function copyMessage() {
  try {
    await navigator.clipboard.writeText(props.message.text)
    copied.value = true
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (err) {
    console.warn('复制到剪贴板失败', err)
  }
}

onBeforeUnmount(() => {
  if (copyTimer) clearTimeout(copyTimer)
})
</script>
