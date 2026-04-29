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
        </button>
      </div>
      <div class="input-box">
        <textarea
          v-model="input"
          rows="1"
          placeholder="回答问题，或问我一个反问…  (Enter 发送 · Shift+Enter 换行)"
          @keydown.enter.exact.prevent="send"
        />
        <button
          class="send-btn"
          :disabled="!input.trim() || isThinking || isGenerating"
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
import { ref, watch, nextTick, onMounted, computed } from 'vue'
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
const messages = ref<Message[]>([])

const currentTopicId = computed(() => Number(store.activeTopicId) || 0)
const hasActiveTopic = computed(() => store.topics.length > 0)
const chatMode = ref<'socratic' | 'normal'>('socratic')

const chips = ['我想学 Python', '教我机器学习', '讲讲数据结构', '学习 Web 开发']

function now() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function scrollToBottom() {
  nextTick(() => {
    if (scrollRef.value) scrollRef.value.scrollTop = scrollRef.value.scrollHeight
  })
}

onMounted(() => {
  messages.value = [{
    role: 'ai',
    text: '你好！我是 Socrates，你的 AI 学习导师 ✦\n\n告诉我你想学什么，我来为你生成专属知识图谱，然后引导你一步步掌握它。',
    time: now(),
  }]
})

// 判断是否是想学某个主题的意图
function isLearnIntent(text: string): boolean {
  const keywords = ['学', '想了解', '教我', '讲讲', '入门', '学习']
  return keywords.some(k => text.includes(k))
}

// 提取主题名
function extractTopic(text: string): string {
  return text
    .replace(/我想学|教我|学习|了解|讲讲|帮我学|入门/g, '')
    .replace(/[，。！？,!?]/g, '')
    .trim() || text.trim()
}

async function send() {
  const v = input.value.trim()
  if (!v || isThinking.value || isGenerating.value) return

  messages.value.push({ role: 'user', text: v, time: now() })
  input.value = ''
  scrollToBottom()

  // 普通对话模式：直接发送，不需要选节点
  if (chatMode.value === 'normal') {
    isThinking.value = true
    streamingText.value = ''

    const history = messages.value.slice(-10).map(m => ({
      role: m.role as 'ai' | 'user',
      content: m.text,
    }))

    chatStream(
      'normal', 0, v, history, 'normal',
      (chunk) => { streamingText.value += chunk; scrollToBottom() },
      () => {
        const finalText = streamingText.value
        streamingText.value = ''
        isThinking.value = false
        if (finalText.trim()) messages.value.push({ role: 'ai', text: finalText, time: now() })
        scrollToBottom()
      },
      (err) => {
        console.error(err)
        messages.value.push({ role: 'ai', text: '抱歉，连接失败，请重试。', time: now() })
        streamingText.value = ''
        isThinking.value = false
        scrollToBottom()
      },
    )
    return
  }

  // 学习模式：判断生成图谱意图
  if (isLearnIntent(v) && !store.activeNode) {
    const topicName = extractTopic(v)
    await handleGenerateTopic(topicName)
    return
  }

  // 学习模式：需要选节点
  if (!store.activeNode) {
    messages.value.push({
      role: 'ai',
      text: '请先在右侧图谱中点击一个节点，我们针对具体知识点来对话 👉',
      time: now(),
    })
    scrollToBottom()
    return
  }

  // 学习模式正常流式对话
  isThinking.value = true
  streamingText.value = ''
  scrollToBottom()

  const history = messages.value.slice(-10).map(m => ({
    role: m.role as 'ai' | 'user',
    content: m.text,
  }))

  chatStream(
    store.activeNode.id,
    currentTopicId.value,
    v,
    history,
    'socratic',
    (chunk) => { streamingText.value += chunk; scrollToBottom() },
    () => {
      const finalText = streamingText.value
      streamingText.value = ''
      isThinking.value = false
      if (finalText.trim()) messages.value.push({ role: 'ai', text: finalText, time: now() })
      scrollToBottom()
    },
    (err) => {
      console.error(err)
      messages.value.push({ role: 'ai', text: '抱歉，连接失败，请重试。', time: now() })
      streamingText.value = ''
      isThinking.value = false
      scrollToBottom()
    },
  )
}

// 生成知识图谱
async function handleGenerateTopic(topicName: string) {
  isGenerating.value = true
  messages.value.push({
    role: 'ai',
    text: `好的！我正在为「**${topicName}**」生成知识图谱，请稍候…`,
    time: now(),
  })
  scrollToBottom()

  try {
    const topic = await generateTopic(topicName)
    // 刷新主题列表和节点
    await store.fetchTopics()
    // 切换到新主题
    await store.setActiveTopic(String(topic.id))

    messages.value.push({
      role: 'ai',
      text: `✦ 知识图谱已生成！共 **${topic.total_nodes}** 个知识节点。\n\n右侧图谱已更新，点击蓝色节点开始你的第一个知识点学习吧！`,
      time: now(),
    })
  } catch (err) {
    messages.value.push({
      role: 'ai',
      text: '生成失败，请重试或换个主题名称。',
      time: now(),
    })
  } finally {
    isGenerating.value = false
    scrollToBottom()
  }
}

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

function resetMessages() {
  messages.value = [{
    role: 'ai',
    text: '对话已重置 ✦ 告诉我你想学什么，我来为你生成新的知识图谱！',
    time: now(),
  }]
  streamingText.value = ''
}

watch(chatMode, (mode) => {
  messages.value.push({
    role: 'ai',
    text: mode === 'socratic'
      ? '已切换到**学习模式** ✦ 我会用苏格拉底式引导帮你深入理解知识点。'
      : '已切换到**普通对话模式** 💬 有什么问题都可以直接问我！',
    time: now(),
  })
  scrollToBottom()
})
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