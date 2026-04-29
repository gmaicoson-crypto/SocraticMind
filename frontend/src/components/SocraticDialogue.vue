<template>
  <div class="dialogue-wrap">

    <!-- Header -->
    <div class="dlg-header">
      <div class="dlg-header-left">
        <div class="ai-avatar" :class="{ thinking: isThinking }">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 2 L13.5 8.5 L20 10 L13.5 11.5 L12 18 L10.5 11.5 L4 10 L10.5 8.5 Z" fill="white"/>
          </svg>
          <span v-if="isThinking" class="thinking-dot" />
        </div>
        <div>
          <div class="dlg-title">
            苏格拉底式对话
            <span class="dlg-badge">SOCRATES · v3</span>
          </div>
          <div class="dlg-sub">
            {{ isThinking ? '正在思考…' : '通过提问引导你发现答案' }}
          </div>
        </div>
      </div>
      <div class="dlg-actions">
        <button class="hdr-btn" title="提示">💡</button>
        <button class="hdr-btn" title="重新开始" @click="resetMessages">↻</button>
      </div>
    </div>

    <!-- Messages -->
    <div ref="scrollRef" class="dlg-messages">
      <div
        v-for="(msg, i) in messages"
        :key="i"
        class="msg-row"
        :class="msg.role"
      >
        <!-- AI 头像 -->
        <div v-if="msg.role === 'ai'" class="ai-avatar sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 2 L13.5 8.5 L20 10 L13.5 11.5 L12 18 L10.5 11.5 L4 10 L10.5 8.5 Z" fill="white"/>
          </svg>
        </div>
        <!-- 用户头像 -->
        <div v-else class="user-avatar">李</div>

        <div class="msg-content" :class="msg.role">
          <div class="bubble" :class="msg.role">
            <InlineMarkdown :text="msg.text" :with-caret="false" />
          </div>
          <div class="msg-meta">
            {{ msg.role === 'ai' ? 'Socrates AI' : '你' }} · {{ msg.time }}
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
            <InlineMarkdown :text="streamingText" :with-caret="true" />
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

    <!-- 快捷建议 -->
    <div class="chips-wrap">
      <button
        v-for="chip in chips"
        :key="chip"
        class="chip"
        @click="input = chip"
      >{{ chip }}</button>
    </div>

    <!-- Input -->
    <div class="input-wrap">
      <div class="input-box">
        <textarea
          v-model="input"
          rows="1"
          placeholder="回答问题，或问我一个反问…  (Enter 发送 · Shift+Enter 换行)"
          @keydown.enter.exact.prevent="send"
        />
        <button
          class="send-btn"
          :disabled="!input.trim()"
          @click="send"
        >
          发送
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <path d="M5 12 L19 12 M13 6 L19 12 L13 18"/>
          </svg>
        </button>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted, computed } from 'vue'
import { useLearningStore } from '../stores/learning'
import type { Message } from '../types'
import InlineMarkdown from './InlineMarkdown.vue'
import { chatStream } from '../api/chat'

const store = useLearningStore()
const scrollRef = ref<HTMLElement | null>(null)
const input = ref('')
const isThinking = ref(false)
const streamingText = ref('')
const messages = ref<Message[]>([])

// 当前节点对应的 topic_id
const currentTopicId = computed(() => Number(store.activeTopicId) || 0)

const chips = ['elif 和 else 的区别？', '举个三分支例子', '我能用 in 替代吗？']

function now() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function scrollToBottom() {
  nextTick(() => {
    if (scrollRef.value) scrollRef.value.scrollTop = scrollRef.value.scrollHeight
  })
}

// 初始欢迎消息
onMounted(() => {
  messages.value = [{
    role: 'ai',
    text: '你好，**学习者** ✦ 点击右侧图谱中的节点开始学习吧！',
    time: now(),
  }]
})

// 点击节点时 AI 响应
watch(() => store.activeNode?.id, (id) => {
  if (!id) return
  const node = store.activeNode!
  const reply = node.state === 'mastered'
    ? `让我们复习一下 **${node.label}**。你能用一句话给新手解释它吗？`
    : `让我们探索 **${node.label}**。在你看来，\`${node.sub}\` 解决了什么问题？`
  messages.value.push({ role: 'ai', text: reply, time: now() })
  scrollToBottom()
})

// 发送消息（真实 SSE）
function send() {
  const v = input.value.trim()
  if (!v || isThinking.value) return

  const node = store.activeNode
  if (!node) {
    messages.value.push({
      role: 'ai',
      text: '请先点击右侧图谱中的一个节点，再开始对话 👉',
      time: now(),
    })
    scrollToBottom()
    return
  }

  messages.value.push({ role: 'user', text: v, time: now() })
  input.value = ''
  isThinking.value = true
  streamingText.value = ''
  scrollToBottom()

  // 构建历史（最近 10 条）
  const history = messages.value.slice(-10).map(m => ({
    role: m.role as 'ai' | 'user',
    content: m.text,
  }))

  chatStream(
    node.id,
    currentTopicId.value,
    v,
    history,
    // onChunk
    (chunk) => {
      streamingText.value += chunk
      scrollToBottom()
    },
    // onDone
    () => {
      const finalText = streamingText.value
      streamingText.value = ''
      isThinking.value = false
      if (finalText.trim()) {
        messages.value.push({ role: 'ai', text: finalText, time: now() })
      }
      scrollToBottom()
    },
    // onError
    (err) => {
      console.error('对话失败', err)
      messages.value.push({ role: 'ai', text: '抱歉，连接失败，请重试。', time: now() })
      streamingText.value = ''
      isThinking.value = false
      scrollToBottom()
    },
  )
}

function resetMessages() {
  messages.value = [{
    role: 'ai',
    text: '对话已重置 ✦ 点击节点开始新的学习！',
    time: now(),
  }]
  streamingText.value = ''
}
</script>

<style scoped>
.dialogue-wrap {
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
  min-height: 0;
  height: 100%;
  flex: 1;
}

.dlg-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(180deg, var(--bg-2), var(--surface));
  flex-shrink: 0;
}

.dlg-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ai-avatar {
  width: 32px; height: 32px;
  flex-shrink: 0;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--blue), var(--blue-2));
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.ai-avatar.sm {
  width: 26px; height: 26px;
  border-radius: 8px;
}

.thinking-dot {
  position: absolute;
  right: -3px; bottom: -3px;
  width: 10px; height: 10px;
  border-radius: 50%;
  background: oklch(0.72 0.12 145);
  border: 2px solid var(--surface);
}

.dlg-title {
  font-weight: 600;
  font-size: 13.5px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.dlg-badge {
  font-size: 10px;
  font-family: var(--font-mono);
  color: var(--blue-2);
  background: var(--blue-tint);
  padding: 1.5px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.dlg-sub {
  font-size: 11px;
  color: var(--ink-3);
  margin-top: 1px;
}

.dlg-actions { display: flex; gap: 6px; }

.hdr-btn {
  width: 28px; height: 28px;
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--ink-2);
  font-size: 12px;
  cursor: pointer;
}
.hdr-btn:hover { background: var(--bg-2); }

.dlg-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px 18px 8px;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.msg-row {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
  align-items: flex-start;
  animation: fadeUp .3s ease-out both;
}

.msg-row.user {
  flex-direction: row-reverse;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: none; }
}

.user-avatar {
  width: 26px; height: 26px;
  border-radius: 8px;
  background: var(--bg-3);
  border: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-2);
  flex-shrink: 0;
}

.msg-content {
  max-width: 78%;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.msg-content.user { align-items: flex-end; }

.bubble {
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--ink);
}

.bubble.ai {
  background: var(--blue-tint);
  border: 1px solid var(--blue-line);
  border-top-left-radius: 4px;
}

.bubble.user {
  background: var(--surface);
  border: 1px solid var(--line);
  border-top-right-radius: 4px;
}

.msg-meta {
  font-size: 10.5px;
  color: var(--ink-3);
  font-family: var(--font-mono);
  padding: 0 4px;
}

.dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--blue-2);
  display: inline-block;
  animation: blink 1.2s ease-in-out infinite;
}

@keyframes blink {
  0%, 60%, 100% { opacity: 1; transform: translateY(0); }
  30% { opacity: 0.4; transform: translateY(-3px); }
}

.chips-wrap {
  display: flex;
  gap: 6px;
  padding: 0 18px 10px;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.chip {
  font-size: 11.5px;
  padding: 5px 10px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--ink-2);
  cursor: pointer;
  font-weight: 500;
  font-family: var(--font-sans);
  transition: all .15s;
}

.chip:hover {
  background: var(--blue-tint);
  border-color: var(--blue-line);
  color: var(--blue-2);
}

.input-wrap {
  padding: 12px;
  border-top: 1px solid var(--line);
  background: var(--bg-2);
  flex-shrink: 0;
}

.input-box {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 8px 10px 8px 14px;
  transition: border-color .15s, box-shadow .15s;
}

.input-box:focus-within {
  border-color: var(--blue);
  box-shadow: 0 0 0 3px oklch(0.72 0.085 235 / 0.15);
}

.input-box textarea {
  flex: 1;
  border: none;
  outline: none;
  resize: none;
  font-size: 13px;
  line-height: 1.5;
  font-family: var(--font-sans);
  background: transparent;
  color: var(--ink);
  padding: 5px 0;
  max-height: 90px;
}

.input-box textarea::placeholder { color: var(--ink-3); }

.send-btn {
  background: var(--blue-2);
  color: white;
  border: none;
  border-radius: 8px;
  padding: 7px 12px;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-sans);
  transition: opacity .15s;
  flex-shrink: 0;
}

.send-btn:disabled {
  background: var(--bg-3);
  color: var(--ink-3);
  cursor: not-allowed;
}

.send-btn:not(:disabled):hover { opacity: 0.85; }
</style>