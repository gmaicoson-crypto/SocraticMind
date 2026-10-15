<template>
  <div
    class="msg-row"
    :class="message.role"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
  >
    <button
      v-if="message.role === 'ai'"
      type="button"
      class="ai-avatar sm"
      title="更改此对话的 AI 头像"
      aria-label="更改此对话的 AI 头像"
      @click="emit('change-ai-avatar')"
    >
      <img :src="avatarSrc(aiAvatarUrl)" alt="" class="ui-avatar-image ai-avatar-image" />
    </button>
    <div v-else class="user-avatar">
      <img
        :src="avatarSrc(avatarUrl ?? defaultUserAvatar)"
        alt="avatar"
        class="user-avatar-img"
        decoding="async"
      />
    </div>

    <div class="msg-content" :class="message.role">
      <AttachmentList :attachments="message.attachments" />
      <div v-if="message.text.trim()" class="bubble" :class="message.role">
        <InlineMarkdown
          :text="message.text"
          :with-caret="false"
          :assistant="message.role === 'ai'"
          :web="messageWeb(message.metadata)"
        />
      </div>
      <MessageSources
        v-if="message.role === 'ai' && hasContent"
        :web="messageWeb(message.metadata)"
      />
      <button
        v-if="message.quote && canJumpToQuote"
        type="button"
        class="msg-quote is-link"
        title="跳转到引用的消息"
        @click="emit('jump-to-quote')"
      >
        <span class="quote-bar" />
        <span class="quote-text">{{ message.quote }}</span>
        <ArrowUpRight :size="14" aria-hidden="true" />
      </button>
      <div v-else-if="message.quote" class="msg-quote">
        <span class="quote-bar" />
        <span class="quote-text">{{ message.quote }}</span>
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
          :disabled="!isLast || isThinking || chatDisabled"
          @click="emit('select-choice', `${choice.label}. ${choice.text}`)"
        >
          <span class="choice-label">{{ choice.label }}</span>
          <span class="choice-text">{{ choice.text }}</span>
        </button>
      </div>

      <div
        class="msg-actions"
        :class="{ visible: hovered || (message.role === 'user' && canRetry && !isThinking) }"
      >
        <span class="msg-time"
          >{{ message.role === 'ai' ? 'Socrates AI' : '你' }} ·
          {{ formatMessageTime(message.time) }}
          <span
            v-if="
              message.metadata?.status === 'interrupted' || message.metadata?.status === 'failed'
            "
          >
            · 未完成</span
          ></span
        >
        <div class="action-btns">
          <button
            v-if="index > 0 || message.db_id != null || message.role === 'user'"
            class="action-btn delete"
            title="删除"
            @click="emit('delete')"
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
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
            </svg>
          </button>
          <button
            v-if="canRetry && !isThinking"
            type="button"
            class="action-btn"
            :title="message.role === 'user' ? '重试' : '重新回答'"
            :aria-label="message.role === 'user' ? '重试' : '重新回答'"
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
              aria-hidden="true"
            >
              <path d="M1 4v6h6M23 20v-6h-6" />
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
            </svg>
          </button>
          <button
            v-if="message.role === 'ai' && hasContent && !chatDisabled"
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
          <button
            v-if="message.text.trim()"
            class="action-btn"
            :title="copied ? '已复制' : '复制'"
            @click="copyMessage"
          >
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
import { computed, onBeforeUnmount, ref } from 'vue'
import { ArrowUpRight } from '@lucide/vue'
import type { Message } from '../../types'
import { formatMessageTime, hasMessageContent } from '../../utils/chat'
import { avatarSrc } from '../../utils/avatar'
import { defaultUserAvatar } from '../../utils/avatarPresets'
import InlineMarkdown from './InlineMarkdown.vue'
import MessageSources from './MessageSources.vue'
import AttachmentList from '../attachments/AttachmentList.vue'
import { messageWeb } from '../../utils/webSearch'

const props = defineProps<{
  message: Message
  index: number
  isLast: boolean
  isThinking: boolean
  chatDisabled?: boolean
  canRetry: boolean
  canJumpToQuote: boolean
  avatarUrl: string | null
  aiAvatarUrl: string
}>()

const emit = defineEmits<{
  delete: []
  retry: []
  quote: []
  'jump-to-quote': []
  'change-ai-avatar': []
  'select-choice': [text: string]
}>()

const hovered = ref(false)
const hasContent = computed(() => hasMessageContent(props.message))
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
