<template>
  <!-- 滚动到底部按钮：当容器距底部 > 80px 时浮现 -->
  <Transition name="scroll-btn">
    <button
      v-if="showScrollBtn"
      class="scroll-to-bottom"
      title="滚动到底部"
      @click="scrollToBottom"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </button>
  </Transition>

  <div ref="scrollRef" class="dlg-messages" @scroll="onMessagesScroll">
    <!-- v-memo：消息内容、悬浮态、复制态没变就跳过 vnode diff -->
    <!-- 流式输出 stream chunk 触发父级重渲染时，已完成的旧消息行直接复用 -->
    <div
      v-for="(msg, i) in messages"
      :key="(msg.db_id ?? `${msg.role}-${msg.time}-${i}`)"
      v-memo="[msg.text, msg.quote, msg.time, msg.selected_choice, hoveredIndex === i, copiedIndex === i, isThinking]"
      class="msg-row"
      :class="msg.role"
      @mouseenter="hoveredIndex = i"
      @mouseleave="hoveredIndex = null"
    >
      <div v-if="msg.role === 'ai'" class="ai-avatar sm">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M12 2 L13.5 8.5 L20 10 L13.5 11.5 L12 18 L10.5 11.5 L4 10 L10.5 8.5 Z" fill="white"/>
        </svg>
      </div>
      <div v-else class="user-avatar" :style="avatarUrl ? {} : { background: avatarGrad }">
        <img v-if="avatarUrl" :src="avatarSrc(avatarUrl)" alt="avatar" class="user-avatar-img" decoding="async" />
        <template v-else>{{ userInitial }}</template>
      </div>

      <div class="msg-content" :class="msg.role">
        <div v-if="msg.quote" class="msg-quote">
          <span class="quote-bar" />
          <span class="quote-text">{{ msg.quote }}</span>
        </div>
        <div class="bubble" :class="msg.role">
          <InlineMarkdown :text="msg.text" :with-caret="false" />
        </div>
        <!-- 历史 AI 选项（非最后一条）：静态展示，已选高亮，不可点击 -->
        <div
          v-if="msg.choices && msg.choices.length && msg.role === 'ai' && i < messages.length - 1"
          class="choices-row historical"
        >
          <div
            v-for="c in msg.choices"
            :key="c.label"
            class="choice-btn"
            :class="{ selected: msg.selected_choice === c.label }"
          >
            <span class="choice-label">{{ c.label }}</span>
            <span class="choice-text">{{ c.text }}</span>
          </div>
        </div>
        <!-- 最后一条 AI 选项：可点击，已选高亮 -->
        <div
          v-if="msg.choices && msg.choices.length && msg.role === 'ai' && i === messages.length - 1 && !isThinking"
          class="choices-row"
        >
          <button
            v-for="c in msg.choices"
            :key="c.label"
            class="choice-btn"
            :class="{ selected: msg.selected_choice === c.label }"
            @click="$emit('select-choice', c.label + '. ' + c.text)"
          >
            <span class="choice-label">{{ c.label }}</span>
            <span class="choice-text">{{ c.text }}</span>
          </button>
        </div>
        <div class="msg-actions" :class="{ visible: hoveredIndex === i }">
          <span class="msg-time">{{ msg.role === 'ai' ? 'Socrates AI' : '你' }} · {{ msg.time }}</span>
          <div class="action-btns">
            <button v-if="i > 0" class="action-btn delete" title="删除" @click="$emit('delete', i)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
              </svg>
            </button>
            <button v-if="msg.role === 'ai' && !isThinking" class="action-btn" title="重新回答" @click="$emit('retry', i)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M1 4v6h6M23 20v-6h-6"/>
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
              </svg>
            </button>
            <button v-if="msg.role === 'ai'" class="action-btn" title="引用追问" @click="$emit('quote', msg)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </button>
            <button class="action-btn" :title="copiedIndex === i ? '已复制' : '复制'" @click="onCopy(msg, i)">
              <svg v-if="copiedIndex !== i" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--blue-2)" stroke-width="2" stroke-linecap="round">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 流式输出中 -->
    <div v-if="streamingText" class="msg-row ai">
      <div class="ai-avatar sm">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M12 2 L13.5 8.5 L20 10 L13.5 11.5 L12 18 L10.5 11.5 L4 10 L10.5 8.5 Z" fill="white"/>
        </svg>
      </div>
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

    <!-- 思考中 dots -->
    <div v-if="isThinking && !streamingText" class="msg-row ai">
      <div class="ai-avatar sm">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M12 2 L13.5 8.5 L20 10 L13.5 11.5 L12 18 L10.5 11.5 L4 10 L10.5 8.5 Z" fill="white"/>
        </svg>
      </div>
      <div class="bubble ai" style="display:flex; gap:4px; align-items:center; padding: 12px 14px;">
        <span class="dot" style="animation-delay:0ms" />
        <span class="dot" style="animation-delay:150ms" />
        <span class="dot" style="animation-delay:300ms" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onBeforeUnmount } from 'vue'
import type { Message } from '../../types'
import InlineMarkdown from '../InlineMarkdown.vue'
import { avatarSrc } from '../../utils/avatar'

defineEmits<{
  (e: 'delete', index: number): void
  (e: 'retry', index: number): void
  (e: 'quote', msg: Message): void
  (e: 'select-choice', text: string): void
}>()

const props = defineProps<{
  messages: Message[]
  streamingText: string
  streamingChoices?: { label: string; text: string }[] | null
  isThinking: boolean
  userInitial: string
  avatarUrl: string | null
  avatarGrad: string
}>()

const displayStreamingText = computed(() => {
  let text = props.streamingText
  // 去掉完整的 [CHOICES]...[ECHOICES] 块
  text = text.replace(/\s*\[CHOICES\][\s\S]*?\[ECHOICES\]\s*/g, '')
  // [CHOICES] 已到但 [ECHOICES] 还没到 → 截断，不暴露裸标签
  const idx = text.indexOf('[CHOICES]')
  if (idx !== -1) text = text.slice(0, idx)
  return text
})


const scrollRef = ref<HTMLElement | null>(null)
const showScrollBtn = ref(false)
const hoveredIndex = ref<number | null>(null)
const copiedIndex = ref<number | null>(null)

// rAF 节流：scroll 事件 ~60Hz，每帧只检查一次距底部距离
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

// 复制本身在子组件完成（独立的"已复制"反馈），交互结束后通知父组件以便它做埋点等
async function onCopy(msg: Message, index: number) {
  try {
    await navigator.clipboard.writeText(msg.text)
    copiedIndex.value = index
    setTimeout(() => { copiedIndex.value = null }, 2000)
  } catch (err) {
    console.warn('复制到剪贴板失败', err)
  }
}


onBeforeUnmount(() => {
  if (scrollFrame !== null) cancelAnimationFrame(scrollFrame)
})

defineExpose({ scrollToBottom })
</script>

<style scoped>
.dlg-messages {
  flex: 1; min-height: 0; overflow-y: auto;
  padding: 16px 20px; display: flex; flex-direction: column; gap: 14px;
  background: var(--bg);
}
.msg-row { display: flex; gap: 10px; align-items: flex-start; }
.msg-row.ai .msg-content { max-width: 75%; }
.msg-row.user { flex-direction: row-reverse; }
.msg-row.user .msg-content { max-width: 75%; align-items: flex-end; }
.msg-content { display: flex; flex-direction: column; gap: 4px; }

.ai-avatar.sm {
  width: 28px; height: 28px; flex-shrink: 0;
  border-radius: 8px; background: linear-gradient(135deg, var(--blue), var(--blue-2));
  display: flex; align-items: center; justify-content: center;
}
.user-avatar {
  width: 28px; height: 28px; flex-shrink: 0; border-radius: 8px;
  background: var(--bg-3); color: var(--ink-2); font-weight: 600;
  display: flex; align-items: center; justify-content: center; font-size: 12px;
  overflow: hidden;
}
.user-avatar-img {
  width: 100%; height: 100%; object-fit: cover;
  border-radius: inherit;
}

.msg-quote {
  display: flex; gap: 8px; align-items: stretch; padding: 4px 0;
  font-size: 11.5px; color: var(--ink-3);
  font-style: italic; max-width: 100%;
}
.quote-bar { width: 3px; background: var(--blue-line); border-radius: 2px; flex-shrink: 0; }
.quote-text {
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}

.bubble {
  padding: 10px 14px; border-radius: 12px; line-height: 1.65;
  font-size: 13.5px; word-wrap: break-word; overflow-wrap: anywhere;
}
.bubble.ai { background: var(--surface); border: 1px solid var(--line); color: var(--ink); }
.bubble.user { background: var(--blue-2); color: white; }

.msg-actions {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 10.5px; color: var(--ink-3);
  opacity: 0; transition: opacity .15s; min-height: 18px;
}
.msg-actions.visible { opacity: 1; }
.msg-row.user .msg-actions { flex-direction: row-reverse; }
.msg-time { font-family: var(--font-mono); }
.action-btns { display: flex; gap: 4px; }
.action-btn {
  background: transparent; border: none; cursor: pointer; padding: 3px;
  border-radius: 4px; color: var(--ink-3); display: flex; align-items: center;
  transition: all .15s;
}
.action-btn:hover { background: var(--bg-3); color: var(--ink); }
.action-btn.delete:hover { color: #c14545; background: oklch(0.96 0.025 25); }

.dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--ink-3); animation: dot 1.2s infinite;
}
@keyframes dot {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1); }
}

/* 选项按钮 */
.choices-row {
  display: flex; flex-direction: column; gap: 5px; margin-top: 4px;
}
.choice-btn {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px;
  background: var(--surface); border: 1px solid var(--blue-line); border-radius: 8px;
  cursor: pointer; text-align: left; font-family: var(--font-sans);
  transition: all .15s;
}
.choice-btn:hover {
  background: var(--blue-tint); border-color: var(--blue-2);
  transform: translateX(2px);
}
.choice-label {
  width: 22px; height: 22px;
  display: flex; align-items: center; justify-content: center;
  background: var(--blue-soft); color: var(--blue-2);
  font-size: 11px; font-weight: 700; border-radius: 5px; flex-shrink: 0;
}
.choice-text {
  font-size: 12.5px; color: var(--ink-2); line-height: 1.4;
}
.choice-btn.selected {
  background: var(--blue-tint);
  border-color: var(--blue-2);
}
.choice-btn.selected .choice-label {
  background: var(--blue-2);
  color: white;
}
.choices-row.historical .choice-btn {
  cursor: default;
  opacity: 0.65;
}
.choices-row.historical .choice-btn:hover {
  transform: none;
  background: var(--surface);
  border-color: var(--blue-line);
}
.choices-row.historical .choice-btn.selected {
  opacity: 1;
}

.scroll-to-bottom {
  position: absolute; bottom: 132px; right: 18px;
  width: 34px; height: 34px; border-radius: 50%;
  background: var(--surface); border: 1px solid var(--line);
  box-shadow: 0 2px 8px rgba(0,0,0,0.12); color: var(--ink-2);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; z-index: 10;
  transition: background .15s, color .15s, box-shadow .15s;
}
.scroll-to-bottom:hover { background: var(--blue-tint); color: var(--blue-2); border-color: var(--blue-line); }
.scroll-btn-enter-active, .scroll-btn-leave-active { transition: opacity .2s, transform .2s; }
.scroll-btn-enter-from, .scroll-btn-leave-to { opacity: 0; transform: translateY(8px); }
</style>
