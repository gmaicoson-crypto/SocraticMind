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
        @mouseenter="hoveredIndex = i"
        @mouseleave="hoveredIndex = null"
      >
        <!-- AI 头像 -->
        <div v-if="msg.role === 'ai'" class="ai-avatar sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 2 L13.5 8.5 L20 10 L13.5 11.5 L12 18 L10.5 11.5 L4 10 L10.5 8.5 Z" fill="white"/>
          </svg>
        </div>
        <!-- 用户头像 -->
        <div v-else class="user-avatar">{{ userInitial }}</div>

        <div class="msg-content" :class="msg.role">
          <!-- 引用块 -->
          <div v-if="msg.quote" class="msg-quote">
            <span class="quote-bar" />
            <span class="quote-text">{{ msg.quote }}</span>
          </div>

          <div class="bubble" :class="msg.role">
            <InlineMarkdown :text="msg.text" :with-caret="false" />
          </div>

          <!-- 消息操作栏 -->
          <div class="msg-actions" :class="{ visible: hoveredIndex === i }">
            <span class="msg-time">{{ msg.role === 'ai' ? 'Socrates AI' : '你' }} · {{ msg.time }}</span>
            <div class="action-btns">
              <!-- 重新回答（所有 AI 消息都显示，不限于最后一条） -->
              <button
                v-if="msg.role === 'ai' && !isThinking"
                class="action-btn"
                title="重新回答"
                @click="retryAt(i)"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M1 4v6h6M23 20v-6h-6"/>
                  <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
                </svg>
              </button>
              <!-- 引用追问（AI消息） -->
              <button
                v-if="msg.role === 'ai'"
                class="action-btn"
                title="引用追问"
                @click="quoteMessage(msg)"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </button>
              <!-- 复制 -->
              <button
                class="action-btn"
                :title="copiedIndex === i ? '已复制' : '复制'"
                @click="copyMessage(msg, i)"
              >
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

    <!-- 引用预览条 -->
    <div v-if="quotedText" class="quote-preview">
      <div class="quote-preview-content">
        <span class="quote-preview-bar" />
        <span class="quote-preview-text">{{ quotedText.slice(0, 80) }}{{ quotedText.length > 80 ? '…' : '' }}</span>
      </div>
      <button class="quote-clear" @click="quotedText = ''" title="取消引用">✕</button>
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
      <!-- 模式切换 -->
      <div class="mode-switch">
        <button
          class="mode-btn"
          :class="{ active: chatMode === 'socratic' }"
          @click="chatMode = 'socratic'"
          title="学习模式：苏格拉底式引导"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5Z"/>
          </svg>
          学习
          <span v-if="socraticMessages.length > 1" class="mode-badge">
            {{ socraticMessages.length - 1 }}
          </span>
        </button>
        <button
          class="mode-btn"
          :class="{ active: chatMode === 'normal' }"
          @click="chatMode = 'normal'"
          title="普通模式：直接对话"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          对话
          <span v-if="normalMessages.length > 1" class="mode-badge">
            {{ normalMessages.length - 1 }}
          </span>
        </button>
      </div>

      <div class="input-box">
        <textarea
          v-model="input"
          rows="1"
          :placeholder="chatMode === 'socratic' ? '回答问题，或问我一个反问…  (Enter 发送 · Shift+Enter 换行)' : '随便问我什么…  (Enter 发送 · Shift+Enter 换行)'"
          @keydown.enter.exact.prevent="send"
        />
        <!-- 中断按钮（思考中时显示） -->
        <button
          v-if="isThinking"
          class="abort-btn"
          title="中断回答"
          @click="abortChat"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <rect x="4" y="4" width="16" height="16" rx="2"/>
          </svg>
          中断
        </button>
        <!-- 发送按钮 -->
        <button
          v-else
          class="send-btn"
          :disabled="!input.trim() || isGenerating"
          @click="send"
        >
          <span v-if="isGenerating">生成中…</span>
          <template v-else>
            发送
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <path d="M5 12 L19 12 M13 6 L19 12 L13 18"/>
            </svg>
          </template>
        </button>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import { useLearningStore } from '../stores/learning'
import type { Message } from '../types'
import InlineMarkdown from './InlineMarkdown.vue'
import { chatStream } from '../api/chat'
import { generateTopic } from '../api/topic'

const store = useLearningStore()
const scrollRef = ref<HTMLElement | null>(null)
const input = ref('')
const isThinking = ref(false)
const isGenerating = ref(false)
const streamingText = ref('')
const hoveredIndex = ref<number | null>(null)
const copiedIndex = ref<number | null>(null)
const quotedText = ref('')

// AbortController 用于中断请求
let abortController: AbortController | null = null

const userInitial = computed(() => {
  const name = store.userInfo?.username ?? '学'
  return name.slice(0, 1)
})

// 两个独立消息列表
const socraticMessages = ref<Message[]>([{
  role: 'ai',
  text: '你好！我是 Socrates，你的 AI 学习导师 ✦\n\n告诉我你想学什么，我来为你生成专属知识图谱，然后引导你一步步掌握它。',
  time: now(),
}])

const normalMessages = ref<Message[]>([{
  role: 'ai',
  text: '你好！我是你的 AI 助手 💬\n\n有任何问题都可以直接问我，我会直接给出答案。',
  time: now(),
}])

const messages = computed({
  get: () => chatMode.value === 'socratic' ? socraticMessages.value : normalMessages.value,
  set: (val) => {
    if (chatMode.value === 'socratic') socraticMessages.value = val
    else normalMessages.value = val
  }
})

const currentTopicId = computed(() => Number(store.activeTopicId) || 0)
const chatMode = ref<'socratic' | 'normal'>('socratic')
const chips = ['我想学 Python', '教我机器学习', '讲讲数据结构', '学习 Web 开发']

function now() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function pushMessage(msg: Message) {
  if (chatMode.value === 'socratic') socraticMessages.value.push(msg)
  else normalMessages.value.push(msg)
}

function scrollToBottom() {
  nextTick(() => {
    if (scrollRef.value) scrollRef.value.scrollTop = scrollRef.value.scrollHeight
  })
}

// 复制消息
async function copyMessage(msg: Message, index: number) {
  try {
    await navigator.clipboard.writeText(msg.text)
    copiedIndex.value = index
    setTimeout(() => { copiedIndex.value = null }, 2000)
  } catch {}
}

// 引用消息
function quoteMessage(msg: Message) {
  const plain = msg.text.replace(/[#*`>]/g, '').trim()
  quotedText.value = plain.slice(0, 200)
  nextTick(() => {
    const textarea = document.querySelector('.input-box textarea') as HTMLTextAreaElement
    textarea?.focus()
  })
}

// 中断对话
function abortChat() {
  if (abortController) {
    abortController.abort()
    abortController = null
  }
  const partial = streamingText.value.trim()
  streamingText.value = ''
  isThinking.value = false
  if (partial) {
    pushMessage({ role: 'ai', text: partial, time: now() })
  }
  scrollToBottom()
}

function isLearnIntent(text: string): boolean {
  const keywords = ['学', '想了解', '教我', '讲讲', '入门', '学习']
  return keywords.some(k => text.includes(k))
}

function extractTopic(text: string): string {
  return text
    .replace(/我想学|教我|学习|了解|讲讲|帮我学|入门/g, '')
    .replace(/[，。！？,!?]/g, '')
    .trim() || text.trim()
}

function buildUserInput(v: string): string {
  if (quotedText.value) {
    const q = quotedText.value
    quotedText.value = ''
    return `> ${q}\n\n${v}`
  }
  return v
}

async function send() {
  const v = input.value.trim()
  if (!v || isThinking.value || isGenerating.value) return

  const userInput = buildUserInput(v)
  const quoteSnapshot = quotedText.value
  quotedText.value = ''

  pushMessage({
    role: 'user',
    text: v,
    quote: quoteSnapshot || undefined,
    time: now(),
  })
  input.value = ''
  scrollToBottom()

  abortController = new AbortController()

  if (chatMode.value === 'normal') {
    isThinking.value = true
    streamingText.value = ''
    const history = messages.value.slice(-10).map(m => ({ role: m.role as 'ai' | 'user', content: m.text }))

    chatStream(
      'normal', 0, userInput, history, 'normal',
      (chunk) => { streamingText.value += chunk; scrollToBottom() },
      () => {
        const t = streamingText.value; streamingText.value = ''; isThinking.value = false
        if (t.trim()) pushMessage({ role: 'ai', text: t, time: now() })
        scrollToBottom()
      },
      (err) => {
        if (err?.name === 'AbortError') return
        pushMessage({ role: 'ai', text: '抱歉，连接失败，请重试。', time: now() })
        streamingText.value = ''; isThinking.value = false; scrollToBottom()
      },
      abortController,
    )
    return
  }

  if (isLearnIntent(v) && !store.activeNode) {
    await handleGenerateTopic(extractTopic(v))
    return
  }

  if (!store.activeNode) {
    pushMessage({ role: 'ai', text: '请先在右侧图谱中点击一个节点，我们针对具体知识点来对话 👉', time: now() })
    scrollToBottom()
    return
  }

  isThinking.value = true
  streamingText.value = ''
  scrollToBottom()
  const history = messages.value.slice(-10).map(m => ({ role: m.role as 'ai' | 'user', content: m.text }))

  chatStream(
    store.activeNode.id, currentTopicId.value, userInput, history, 'socratic',
    (chunk) => { streamingText.value += chunk; scrollToBottom() },
    () => {
      const t = streamingText.value; streamingText.value = ''; isThinking.value = false
      if (t.trim()) pushMessage({ role: 'ai', text: t, time: now() })
      scrollToBottom()
    },
    (err) => {
      if (err?.name === 'AbortError') return
      pushMessage({ role: 'ai', text: '抱歉，连接失败，请重试。', time: now() })
      streamingText.value = ''; isThinking.value = false; scrollToBottom()
    },
    abortController,
  )
}

// 重新回答指定索引的 AI 消息
async function retryAt(aiIndex: number) {
  if (isThinking.value) return
  const msgs = chatMode.value === 'socratic' ? socraticMessages.value : normalMessages.value

  // 找该条 AI 消息前最近的用户消息
  let userMsg: Message | null = null
  for (let i = aiIndex - 1; i >= 0; i--) {
    if (msgs[i].role === 'user') { userMsg = msgs[i]; break }
  }
  if (!userMsg) return

  // 截断到该条 AI 消息之前的历史（不含该条 AI 回复）
  const history = msgs.slice(0, aiIndex)
    .map(m => ({ role: m.role as 'ai' | 'user', content: m.text }))
    .slice(-10)

  // 移除该条 AI 消息及其之后的所有消息
  const trimmed = msgs.slice(0, aiIndex)
  if (chatMode.value === 'socratic') socraticMessages.value = trimmed
  else normalMessages.value = trimmed

  // 重新生成
  abortController = new AbortController()
  isThinking.value = true
  streamingText.value = ''
  scrollToBottom()

  const nodeKey = store.activeNode?.id ?? 'normal'
  const topicId = currentTopicId.value
  const mode = chatMode.value

  chatStream(
    nodeKey, topicId, userMsg.text, history, mode,
    (chunk) => { streamingText.value += chunk; scrollToBottom() },
    () => {
      const t = streamingText.value; streamingText.value = ''; isThinking.value = false
      if (t.trim()) pushMessage({ role: 'ai', text: t, time: now() })
      scrollToBottom()
    },
    (err) => {
      if (err?.name === 'AbortError') return
      pushMessage({ role: 'ai', text: '抱歉，连接失败，请重试。', time: now() })
      streamingText.value = ''; isThinking.value = false; scrollToBottom()
    },
    abortController,
  )
}

async function handleGenerateTopic(topicName: string) {
  isGenerating.value = true
  pushMessage({ role: 'ai', text: `好的！我正在为「**${topicName}**」生成知识图谱，请稍候…`, time: now() })
  scrollToBottom()
  try {
    const topic = await generateTopic(topicName)
    await store.fetchTopics()
    await store.setActiveTopic(String(topic.id))
    pushMessage({ role: 'ai', text: `✦ 知识图谱已生成！共 **${topic.total_nodes}** 个知识节点。\n\n右侧图谱已更新，点击蓝色节点开始学习吧！`, time: now() })
  } catch {
    pushMessage({ role: 'ai', text: '生成失败，请重试或换个主题名称。', time: now() })
  } finally {
    isGenerating.value = false
    scrollToBottom()
  }
}

watch(() => store.activeNode?.id, (id) => {
  if (!id) return
  const node = store.activeNode!
  const reply = node.state === 'mastered'
    ? `让我们复习一下 **${node.label}**。你能用一句话给新手解释它吗？`
    : `让我们探索 **${node.label}**。在你看来，\`${node.sub}\` 解决了什么问题？`
  pushMessage({ role: 'ai', text: reply, time: now() })
  scrollToBottom()
})

function resetMessages() {
  if (chatMode.value === 'socratic') {
    socraticMessages.value = [{ role: 'ai', text: '对话已重置 ✦ 告诉我你想学什么，我来为你生成新的知识图谱！', time: now() }]
  } else {
    normalMessages.value = [{ role: 'ai', text: '对话已重置 💬 有什么问题都可以直接问我！', time: now() }]
  }
  streamingText.value = ''
  quotedText.value = ''
}

watch(chatMode, () => { scrollToBottom() })
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

.msg-row.user { flex-direction: row-reverse; }

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
  gap: 2px;
}

.msg-content.user { align-items: flex-end; }

/* 引用块 */
.msg-quote {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 5px 10px;
  background: var(--bg-2);
  border-radius: 6px;
  margin-bottom: 2px;
  max-width: 100%;
}

.quote-bar {
  width: 2.5px;
  min-height: 16px;
  background: var(--blue-2);
  border-radius: 2px;
  flex-shrink: 0;
  margin-top: 2px;
}

.quote-text {
  font-size: 11.5px;
  color: var(--ink-3);
  line-height: 1.5;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.bubble {
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--ink);
  word-break: break-word;
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

/* 消息操作栏 */
.msg-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
  opacity: 0;
  transition: opacity .15s;
  gap: 8px;
}

.msg-actions.visible { opacity: 1; }

.msg-time {
  font-size: 10.5px;
  color: var(--ink-3);
  font-family: var(--font-mono);
}

.action-btns {
  display: flex;
  gap: 3px;
}

.action-btn {
  width: 22px; height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 5px;
  color: var(--ink-3);
  cursor: pointer;
  transition: all .15s;
}

.action-btn:hover {
  background: var(--bg-2);
  border-color: var(--line);
  color: var(--ink);
}

/* 引用预览条 */
.quote-preview {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 14px;
  background: var(--blue-tint);
  border-top: 1px solid var(--blue-line);
  gap: 8px;
  flex-shrink: 0;
}

.quote-preview-content {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.quote-preview-bar {
  width: 2.5px;
  height: 20px;
  background: var(--blue-2);
  border-radius: 2px;
  flex-shrink: 0;
}

.quote-preview-text {
  font-size: 12px;
  color: var(--blue-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.quote-clear {
  background: transparent;
  border: none;
  color: var(--ink-3);
  cursor: pointer;
  font-size: 12px;
  padding: 2px 4px;
  border-radius: 4px;
  flex-shrink: 0;
}
.quote-clear:hover { color: var(--ink); background: var(--bg-2); }

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

.mode-switch {
  display: flex;
  gap: 4px;
  padding: 0 0 8px;
}

.mode-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 500;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--ink-3);
  cursor: pointer;
  font-family: var(--font-sans);
  transition: all .15s;
}

.mode-btn.active {
  background: var(--blue-tint);
  border-color: var(--blue-line);
  color: var(--blue-2);
}

.mode-btn:not(.active):hover {
  background: var(--bg-3);
  color: var(--ink-2);
}

.mode-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  background: var(--blue-2);
  color: white;
  font-size: 10px;
  font-weight: 600;
  border-radius: 999px;
  margin-left: 2px;
}

.mode-btn:not(.active) .mode-badge { background: var(--ink-3); }

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

/* 中断按钮 */
.abort-btn {
  background: #FCEBEB;
  color: #E24B4A;
  border: 1px solid #F7C1C1;
  border-radius: 8px;
  padding: 7px 12px;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-sans);
  flex-shrink: 0;
  transition: all .15s;
}

.abort-btn:hover {
  background: #F7C1C1;
}
</style>