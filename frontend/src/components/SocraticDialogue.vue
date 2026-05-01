<template>
  <div class="dialogue-wrap">

    <!-- History Panel -->
    <Transition name="slide-left">
      <div v-if="showHistory" class="history-panel">
        <div class="history-header">
          <span class="history-title">{{ chatMode === 'socratic' ? '学习对话历史' : '普通对话历史' }}</span>
          <button class="history-close" @click="showHistory = false">✕</button>
        </div>
        <div class="history-list">
          <div
            v-for="(session) in currentSessions"
            :key="session.id"
            class="history-item"
            :class="{ active: currentSessionId === session.id }"
            @click="switchSession(session.id)"
          >
            <div class="history-item-content">
              <div v-if="editingSessionId === session.id" class="history-edit">
                <input
                  ref="editInputRef"
                  v-model="editingName"
                  class="history-name-input"
                  @keydown.enter="saveSessionName(session.id)"
                  @keydown.escape="editingSessionId = null"
                  @click.stop
                />
                <button class="history-save-btn" @click.stop="saveSessionName(session.id)">✓</button>
                <button class="history-cancel-btn" @click.stop="editingSessionId = null">✕</button>
              </div>
              <div v-else class="history-name-wrap">
                <span class="history-name">{{ session.name }}</span>
                <span class="history-count">{{ session.messages.length - 1 }} 条</span>
              </div>
              <div class="history-time">{{ session.updatedAt }}</div>
            </div>
            <div class="history-item-actions" v-if="editingSessionId !== session.id" @click.stop>
              <button class="history-action-btn" title="重命名" @click.stop="startEdit(session)">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button
                class="history-action-btn delete"
                title="删除"
                @click.stop="deleteSession(session.id)"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
        <button class="history-new-btn" @click="newSession">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          新建对话
        </button>
      </div>
    </Transition>

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
            {{ currentSessionName }}
            <span class="dlg-badge">SOCRATES · v3</span>
          </div>
          <div class="dlg-sub">
            {{ isThinking ? '正在思考…' : '通过提问引导你发现答案' }}
          </div>
        </div>
      </div>
      <div class="dlg-actions">
        <button class="hdr-btn" title="对话历史" @click="showHistory = !showHistory">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M12 8v4l3 3M3.05 11a9 9 0 1 0 .5-3"/><path d="M3 4v4h4"/>
          </svg>
        </button>
        <button class="hdr-btn" title="新建对话" @click="newSession">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M12 5v14M5 12h14"/>
          </svg>
        </button>
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
        <div v-if="msg.role === 'ai'" class="ai-avatar sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 2 L13.5 8.5 L20 10 L13.5 11.5 L12 18 L10.5 11.5 L4 10 L10.5 8.5 Z" fill="white"/>
          </svg>
        </div>
        <div v-else class="user-avatar">{{ userInitial }}</div>

        <div class="msg-content" :class="msg.role">
          <div v-if="msg.quote" class="msg-quote">
            <span class="quote-bar" />
            <span class="quote-text">{{ msg.quote }}</span>
          </div>
          <div class="bubble" :class="msg.role">
            <InlineMarkdown :text="msg.text" :with-caret="false" />
          </div>
          <div class="msg-actions" :class="{ visible: hoveredIndex === i }">
            <span class="msg-time">{{ msg.role === 'ai' ? 'Socrates AI' : '你' }} · {{ msg.time }}</span>
            <div class="action-btns">
              <button
                v-if="i > 0"
                class="action-btn delete"
                title="删除"
                @click="deleteMessage(i)"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
                </svg>
              </button>
              <button v-if="msg.role === 'ai' && !isThinking" class="action-btn" title="重新回答" @click="retryAt(i)">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M1 4v6h6M23 20v-6h-6"/>
                  <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
                </svg>
              </button>
              <button v-if="msg.role === 'ai'" class="action-btn" title="引用追问" @click="quoteMessage(msg)">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </button>
              <button class="action-btn" :title="copiedIndex === i ? '已复制' : '复制'" @click="copyMessage(msg, i)">
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
      <template v-if="chipsLoading">
        <div class="chips-loading">
          <span class="chip-skeleton" v-for="i in 4" :key="i" />
        </div>
      </template>
      <template v-else>
        <button
          v-for="chip in chips"
          :key="chip"
          class="chip"
          @click="input = chip"
        >{{ chip }}</button>
        <button class="chip-refresh" title="换一批" @click="loadSuggestions(true)">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M1 4v6h6M23 20v-6h-6"/>
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
          </svg>
        </button>
      </template>
    </div>

    <!-- Input -->
    <div class="input-wrap">
      <div class="input-toolbar">
        <div class="mode-switch">
          <button class="mode-btn" :class="{ active: chatMode === 'socratic' }" @click="chatMode = 'socratic'" title="学习模式">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5Z"/>
            </svg>
            学习
            <span v-if="socraticSessions.length > 0 && currentSocraticSession.messages.length > 1" class="mode-badge">
              {{ currentSocraticSession.messages.length - 1 }}
            </span>
          </button>
          <button class="mode-btn" :class="{ active: chatMode === 'normal' }" @click="chatMode = 'normal'" title="普通对话">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            对话
            <span v-if="normalSessions.length > 0 && currentNormalSession.messages.length > 1" class="mode-badge">
              {{ currentNormalSession.messages.length - 1 }}
            </span>
          </button>
        </div>
        <Transition name="fade-slide">
          <div v-if="chatMode === 'socratic'" class="style-switch">
            <button
              v-for="s in aiStyleOptions"
              :key="s"
              class="style-btn"
              :class="{ active: aiStyle === s }"
              @click="aiStyle = s"
            >{{ s }}</button>
          </div>
        </Transition>
      </div>

      <div class="input-box">
        <textarea
          ref="textareaRef"
          v-model="input"
          rows="1"
          :placeholder="chatMode === 'socratic' ? '回答问题，或问我一个反问…  (Enter 发送 · Shift+Enter 换行)' : '随便问我什么…  (Enter 发送 · Shift+Enter 换行)'"
          @keydown.enter.exact.prevent="send"
          @input="autoResize"
        />
        <button v-if="isThinking" class="abort-btn" title="中断回答" @click="abortChat">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <rect x="4" y="4" width="16" height="16" rx="2"/>
          </svg>
          中断
        </button>
        <button v-else class="send-btn" :disabled="!input.trim() || isGenerating" @click="send">
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
import { ref, watch, nextTick, computed, onMounted } from 'vue'
import { useLearningStore } from '../stores/learning'
import type { Message } from '../types'
import InlineMarkdown from './InlineMarkdown.vue'
import { chatStream, getSuggestions } from '../api/chat'
import { generateTopic } from '../api/topic'

// ── 会话类型 ──
interface Session {
  id: string
  name: string
  messages: Message[]
  updatedAt: string
}

const store = useLearningStore()
const scrollRef = ref<HTMLElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const editInputRef = ref<HTMLInputElement | null>(null)
const input = ref('')
const isThinking = ref(false)
const isGenerating = ref(false)
const streamingText = ref('')
const hoveredIndex = ref<number | null>(null)
const copiedIndex = ref<number | null>(null)
const quotedText = ref('')
const showHistory = ref(false)
const editingSessionId = ref<string | null>(null)
const editingName = ref('')

let abortController: AbortController | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null

const userInitial = computed(() => (store.userInfo?.username ?? '学').slice(0, 1))
const currentTopicId = computed(() => Number(store.activeTopicId) || 0)
const chatMode = ref<'socratic' | 'normal'>('socratic')
const aiStyleOptions = ['温和', '标准', '严格'] as const
const aiStyle = ref<string>(store.userInfo?.ai_style ?? '标准')
const chips = ref<string[]>(loadCachedChips('socratic'))
const chipsLoading = ref(false)

const STORAGE_KEY_SOCRATIC_SESSIONS = 'sm_sessions_socratic'
const STORAGE_KEY_NORMAL_SESSIONS = 'sm_sessions_normal'
const STORAGE_KEY_SOCRATIC_CUR = 'sm_session_cur_socratic'
const STORAGE_KEY_NORMAL_CUR = 'sm_session_cur_normal'
const STORAGE_KEY_CHIPS_SOCRATIC = 'sm_chips_socratic'
const STORAGE_KEY_CHIPS_NORMAL = 'sm_chips_normal'

const socraticSessions = ref<Session[]>(loadSessions(STORAGE_KEY_SOCRATIC_SESSIONS, 'socratic'))
const normalSessions = ref<Session[]>(loadSessions(STORAGE_KEY_NORMAL_SESSIONS, 'normal'))

const socraticCurrentId = ref<string>(loadCurrentId(STORAGE_KEY_SOCRATIC_CUR, socraticSessions.value))
const normalCurrentId = ref<string>(loadCurrentId(STORAGE_KEY_NORMAL_CUR, normalSessions.value))

const currentSessionId = computed(() =>
  chatMode.value === 'socratic' ? socraticCurrentId.value : normalCurrentId.value
)

const currentSessions = computed(() =>
  chatMode.value === 'socratic' ? socraticSessions.value : normalSessions.value
)

const currentSocraticSession = computed(() =>
  socraticSessions.value.find(s => s.id === socraticCurrentId.value) ?? socraticSessions.value[0]
)

const currentNormalSession = computed(() =>
  normalSessions.value.find(s => s.id === normalCurrentId.value) ?? normalSessions.value[0]
)

const currentSession = computed(() =>
  chatMode.value === 'socratic' ? currentSocraticSession.value : currentNormalSession.value
)

const currentSessionName = computed(() => currentSession.value?.name ?? '苏格拉底式对话')

const messages = computed({
  get: () => currentSession.value?.messages ?? [],
  set: (val) => {
    if (!currentSession.value) return
    currentSession.value.messages = val
    currentSession.value.updatedAt = nowDate()
    saveSessions()
  }
})

const defaultChips = {
  socratic: ['我想学 Python', '教我机器学习', '讲讲数据结构', '学习 Web 开发'],
  normal: ['今天天气怎么样', '推荐一部电影', '给我讲个笑话', '聊聊最近的新闻'],
}

function now() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function nowDate() {
  return new Date().toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function genId() {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

function defaultSession(mode: 'socratic' | 'normal'): Session {
  return {
    id: genId(),
    name: mode === 'socratic' ? '新学习对话' : '新普通对话',
    messages: [{
      role: 'ai',
      text: mode === 'socratic'
        ? '你好！我是 Socrates，你的 AI 学习导师 ✦\n\n告诉我你想学什么，我来为你生成专属知识图谱，然后引导你一步步掌握它。'
        : '你好！我是你的 AI 助手 💬\n\n有任何问题都可以直接问我，我会直接给出答案。',
      time: now(),
    }],
    updatedAt: nowDate(),
  }
}

function loadSessions(key: string, mode: 'socratic' | 'normal'): Session[] {
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const sessions = JSON.parse(raw)
      if (sessions.length > 0) return sessions
    }
  } catch {}
  return [defaultSession(mode)]
}

function loadCurrentId(key: string, sessions: Session[]): string {
  try {
    const id = localStorage.getItem(key)
    if (id && sessions.find(s => s.id === id)) return id
  } catch {}
  return sessions[0].id
}

function loadCachedChips(mode: 'socratic' | 'normal'): string[] {
  const key = mode === 'socratic' ? STORAGE_KEY_CHIPS_SOCRATIC : STORAGE_KEY_CHIPS_NORMAL
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw)
  } catch {}
  return []
}

function saveCachedChips(mode: 'socratic' | 'normal', chips: string[]) {
  const key = mode === 'socratic' ? STORAGE_KEY_CHIPS_SOCRATIC : STORAGE_KEY_CHIPS_NORMAL
  localStorage.setItem(key, JSON.stringify(chips))
}

async function loadSuggestions(force = false) {
  const cached = loadCachedChips(chatMode.value)
  // 有缓存且不是强制刷新，直接用缓存
  if (cached.length > 0 && !force) {
    chips.value = cached
    return
  }
  chipsLoading.value = true
  try {
    const result = await getSuggestions(chatMode.value)
    chips.value = result
    saveCachedChips(chatMode.value, result)
  } catch {
    chips.value = defaultChips[chatMode.value]
  } finally {
    chipsLoading.value = false
  }
}

function saveSessions() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    localStorage.setItem(STORAGE_KEY_SOCRATIC_SESSIONS, JSON.stringify(socraticSessions.value))
    localStorage.setItem(STORAGE_KEY_NORMAL_SESSIONS, JSON.stringify(normalSessions.value))
    localStorage.setItem(STORAGE_KEY_SOCRATIC_CUR, socraticCurrentId.value)
    localStorage.setItem(STORAGE_KEY_NORMAL_CUR, normalCurrentId.value)
  }, 300)
}

function pushMessage(msg: Message) {
  if (!currentSession.value) return
  currentSession.value.messages.push(msg)
  currentSession.value.updatedAt = nowDate()
  // 自动根据第一条用户消息更新会话名
  if (msg.role === 'user' && currentSession.value.name.startsWith('新')) {
    currentSession.value.name = msg.text.slice(0, 12) + (msg.text.length > 12 ? '…' : '')
  }
  saveSessions()
}

// 切换会话
function switchSession(id: string) {
  if (chatMode.value === 'socratic') socraticCurrentId.value = id
  else normalCurrentId.value = id
  showHistory.value = false
  saveSessions()
  scrollToBottom()
}

// 新建会话
function newSession() {
  const session = defaultSession(chatMode.value)
  if (chatMode.value === 'socratic') {
    socraticSessions.value.unshift(session)
    socraticCurrentId.value = session.id
  } else {
    normalSessions.value.unshift(session)
    normalCurrentId.value = session.id
  }
  showHistory.value = false
  saveSessions()
  scrollToBottom()
}

// 初始加载
onMounted(() => {
  // 只读缓存，不请求 AI
  const cached = loadCachedChips(chatMode.value)
  chips.value = cached.length > 0 ? cached : defaultChips[chatMode.value]
})

// 切换模式也用缓存的 chips，避免每次切换都请求 AI
watch(chatMode, () => {
  const cached = loadCachedChips(chatMode.value)
  chips.value = cached.length > 0 ? cached : defaultChips[chatMode.value]
  scrollToBottom()
})

// 删除会话
function deleteSession(id: string) {
  if (chatMode.value === 'socratic') {
    if (socraticSessions.value.length <= 1) {
      // 最后一个不删，重置
      socraticSessions.value[0] = defaultSession('socratic')
      socraticCurrentId.value = socraticSessions.value[0].id
    } else {
      const idx = socraticSessions.value.findIndex(s => s.id === id)
      socraticSessions.value.splice(idx, 1)
      if (socraticCurrentId.value === id) {
        socraticCurrentId.value = socraticSessions.value[0].id
      }
    }
  } else {
    if (normalSessions.value.length <= 1) {
      normalSessions.value[0] = defaultSession('normal')
      normalCurrentId.value = normalSessions.value[0].id
    } else {
      const idx = normalSessions.value.findIndex(s => s.id === id)
      normalSessions.value.splice(idx, 1)
      if (normalCurrentId.value === id) {
        normalCurrentId.value = normalSessions.value[0].id
      }
    }
  }
  saveSessions()
}

// 重命名
function startEdit(session: Session) {
  editingSessionId.value = session.id
  editingName.value = session.name
  nextTick(() => editInputRef.value?.focus())
}

function saveSessionName(id: string) {
  const sessions = chatMode.value === 'socratic' ? socraticSessions.value : normalSessions.value
  const session = sessions.find(s => s.id === id)
  if (session && editingName.value.trim()) {
    session.name = editingName.value.trim()
    saveSessions()
  }
  editingSessionId.value = null
}

function scrollToBottom() {
  nextTick(() => {
    if (scrollRef.value) scrollRef.value.scrollTop = scrollRef.value.scrollHeight
  })
}

async function copyMessage(msg: Message, index: number) {
  try {
    await navigator.clipboard.writeText(msg.text)
    copiedIndex.value = index
    setTimeout(() => { copiedIndex.value = null }, 2000)
  } catch {}
}

function quoteMessage(msg: Message) {
  quotedText.value = msg.text.replace(/[#*`>]/g, '').trim().slice(0, 200)
  nextTick(() => {
    (document.querySelector('.input-box textarea') as HTMLTextAreaElement)?.focus()
  })
}

function deleteMessage(index: number) {
  if (!currentSession.value) return
  if (index === 0) return  // 第一条欢迎消息不允许删除
  currentSession.value.messages.splice(index, 1)
  saveSessions()
}

function abortChat() {
  if (abortController) {
    abortController.abort()
    abortController = null
  }
  const partial = streamingText.value.trim()
  streamingText.value = ''
  isThinking.value = false
  if (partial) pushMessage({ role: 'ai', text: partial, time: now() })
  scrollToBottom()
}

function autoResize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  const maxHeight = 110
  el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px'
  el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
}

function resetTextarea() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.overflowY = 'hidden'
}

async function handleAutoMaster() {
  if (!store.activeNode) return
  const currentTopicIdSnapshot = store.activeTopicId
  try {
    await store.masterNode(store.activeNode.id)
    store.setActiveNode({ ...store.activeNode, state: 'mastered' })
    await store.fetchTopicsOnly()
    await store.fetchNodes(Number(currentTopicIdSnapshot))
    const allMastered = store.nodes.length > 0 && store.nodes.every(n => n.state === 'mastered')
    if (allMastered) {
      pushMessage({
        role: 'ai',
        text: '🎉 恭喜！你已经掌握了本主题的**所有知识节点**！\n\n这是一个了不起的成就，继续保持这种学习热情，探索下一个主题吧！',
        time: now(),
      })
    }
  } catch (err) {
    console.error('自动标记掌握失败', err)
  }
}

function handleSignal(signal: string) {
  if (signal === 'MASTERED') handleAutoMaster()
}

function extractTopic(text: string): string {
  const cleaned = text
    .replace(/我想学|教我|学习|了解|讲讲|帮我学|入门|想了解/g, '')
    .replace(/[，。！？,!?一下]/g, '')
    .trim()
  return cleaned.length >= 2 ? cleaned : text.trim()
}

function buildUserInput(v: string): string {
  if (quotedText.value) {
    const q = quotedText.value
    quotedText.value = ''
    return `> ${q}\n\n${v}`
  }
  return v
}

function isNewTopicIntent(text: string): boolean {
  return ['我想学', '教我', '帮我学', '学习', '想了解', '入门'].some(k => text.includes(k))
}

async function send() {
  const v = input.value.trim()
  if (!v || isThinking.value || isGenerating.value) return

  if (chatMode.value === 'socratic') {
    store.recordLearning()
  }

  resetTextarea()
  const userInput = buildUserInput(v)
  const quoteSnapshot = quotedText.value
  quotedText.value = ''

  pushMessage({ role: 'user', text: v, quote: quoteSnapshot || undefined, time: now() })
  input.value = ''
  scrollToBottom()

  abortController = new AbortController()

  if (chatMode.value === 'normal') {
    isThinking.value = true
    streamingText.value = ''
    const history = messages.value.slice(-10).map(m => ({ role: m.role as 'ai' | 'user', content: m.text }))
    chatStream(
      'normal', 0, userInput, history, 'normal', '标准',
      (chunk) => {
        streamingText.value += chunk
        streamingText.value = streamingText.value.replace(/\[MASTERED\]/g, '').replace(/\[CONFIRM_MASTER\]/g, '')
        scrollToBottom()
      },
      () => {
        const t = streamingText.value.replace(/\[MASTERED\]/g, '').replace(/\[CONFIRM_MASTER\]/g, '').trim()
        streamingText.value = ''; isThinking.value = false
        if (t) pushMessage({ role: 'ai', text: t, time: now() })
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

  if (isNewTopicIntent(v)) {
    const topicName = extractTopic(v)
    if (topicName.length >= 2) {
      await handleGenerateTopic(topicName)
      return
    }
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
    store.activeNode.id, currentTopicId.value, userInput, history, 'socratic', aiStyle.value,
    (chunk) => {
      streamingText.value += chunk
      streamingText.value = streamingText.value.replace(/\[MASTERED\]/g, '').replace(/\[CONFIRM_MASTER\]/g, '')
      scrollToBottom()
    },
    () => {
      const t = streamingText.value.replace(/\[MASTERED\]/g, '').replace(/\[CONFIRM_MASTER\]/g, '').trim()
      streamingText.value = ''; isThinking.value = false
      if (t) pushMessage({ role: 'ai', text: t, time: now() })
      scrollToBottom()
    },
    (err) => {
      if (err?.name === 'AbortError') return
      pushMessage({ role: 'ai', text: '抱歉，连接失败，请重试。', time: now() })
      streamingText.value = ''; isThinking.value = false; scrollToBottom()
    },
    abortController,
    handleSignal,
  )
}

async function retryAt(aiIndex: number) {
  if (isThinking.value) return
  const msgs = currentSession.value?.messages ?? []
  let userMsg: Message | null = null
  for (let i = aiIndex - 1; i >= 0; i--) {
    if (msgs[i].role === 'user') { userMsg = msgs[i]; break }
  }
  if (!userMsg || !currentSession.value) return

  currentSession.value.messages = msgs.slice(0, aiIndex)
  saveSessions()

  abortController = new AbortController()
  isThinking.value = true
  streamingText.value = ''
  scrollToBottom()

  const history = msgs.slice(0, aiIndex).map(m => ({ role: m.role as 'ai' | 'user', content: m.text })).slice(-10)

  chatStream(
    store.activeNode?.id ?? 'normal', currentTopicId.value, userMsg.text, history, chatMode.value, aiStyle.value,
    (chunk) => {
      streamingText.value += chunk
      streamingText.value = streamingText.value.replace(/\[MASTERED\]/g, '').replace(/\[CONFIRM_MASTER\]/g, '')
      scrollToBottom()
    },
    () => {
      const t = streamingText.value.replace(/\[MASTERED\]/g, '').replace(/\[CONFIRM_MASTER\]/g, '').trim()
      streamingText.value = ''; isThinking.value = false
      if (t) pushMessage({ role: 'ai', text: t, time: now() })
      scrollToBottom()
    },
    (err) => {
      if (err?.name === 'AbortError') return
      pushMessage({ role: 'ai', text: '抱歉，连接失败，请重试。', time: now() })
      streamingText.value = ''; isThinking.value = false; scrollToBottom()
    },
    abortController,
    handleSignal,
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
    // 更新会话名为主题名
    if (currentSession.value?.name.startsWith('新')) {
      currentSession.value.name = topicName.slice(0, 12)
      saveSessions()
    }
  } catch {
    pushMessage({ role: 'ai', text: '生成失败，请重试或换个主题名称。', time: now() })
  } finally {
    isGenerating.value = false
    scrollToBottom()
  }
}

watch(() => store.activeNode?.id, async (id) => {
  if (!id) return
  if (chatMode.value !== 'socratic') return
  const node = store.activeNode!

  // 用 AI 自由发挥提问，而不是固定模板
  isThinking.value = true
  streamingText.value = ''
  scrollToBottom()

  const prompt = node.state === 'mastered'
    ? `用户想复习「${node.label}」（${node.sub}），请用苏格拉底式提问引导用户回顾这个知识点的核心内容。`
    : `用户开始学习「${node.label}」（${node.sub}），请用苏格拉底式提问引导用户思考这个知识点，从用户已有的生活经验或常识出发。`

  abortController = new AbortController()

  chatStream(
    node.id, currentTopicId.value, prompt,
    [], // 不带历史，这是新节点的开场
    'socratic', aiStyle.value,
    (chunk) => {
      streamingText.value += chunk
      streamingText.value = streamingText.value
        .replace(/\[MASTERED\]/g, '')
        .replace(/\[CONFIRM_MASTER\]/g, '')
      scrollToBottom()
    },
    () => {
      const t = streamingText.value
        .replace(/\[MASTERED\]/g, '')
        .replace(/\[CONFIRM_MASTER\]/g, '')
        .trim()
      streamingText.value = ''
      isThinking.value = false
      if (t) pushMessage({ role: 'ai', text: t, time: now() })
      scrollToBottom()
    },
    (err) => {
      if (err?.name === 'AbortError') return
      streamingText.value = ''
      isThinking.value = false
    },
    abortController,
    handleSignal,
  )
})

</script>

<style scoped>
.dialogue-wrap {
  display: flex; flex-direction: column;
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--radius); overflow: hidden;
  min-height: 0; height: 100%; flex: 1; position: relative;
}

/* ── 历史面板 ── */
.history-panel {
  position: absolute; left: 0; top: 0; bottom: 0;
  width: 260px; z-index: 30;
  background: var(--surface); border-right: 1px solid var(--line);
  display: flex; flex-direction: column;
  box-shadow: 4px 0 20px rgba(0,0,0,0.08);
}
.history-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 14px 10px;
  border-bottom: 1px solid var(--line);
  background: linear-gradient(180deg, var(--bg-2), var(--surface));
  flex-shrink: 0;
}
.history-title { font-size: 12.5px; font-weight: 600; color: var(--ink); }
.history-close {
  background: transparent; border: none; color: var(--ink-3);
  cursor: pointer; font-size: 13px; padding: 2px 5px;
  border-radius: 4px;
}
.history-close:hover { background: var(--bg-2); color: var(--ink); }
.history-list { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 3px; }
.history-item {
  display: flex; align-items: center; gap: 6px;
  padding: 9px 10px; border-radius: 8px;
  cursor: pointer; border: 1px solid transparent;
  transition: all .15s;
}
.history-item:hover { background: var(--bg-2); }
.history-item.active { background: var(--blue-tint); border-color: var(--blue-line); }
.history-item-content { flex: 1; min-width: 0; }
.history-name-wrap { display: flex; align-items: baseline; gap: 6px; }
.history-name {
  font-size: 12.5px; font-weight: 500; color: var(--ink);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-width: 130px;
}
.history-count { font-size: 10px; color: var(--ink-3); font-family: var(--font-mono); flex-shrink: 0; }
.history-time { font-size: 10px; color: var(--ink-3); font-family: var(--font-mono); margin-top: 2px; }
.history-edit { display: flex; gap: 4px; align-items: center; }
.history-name-input {
  flex: 1; font-size: 12px; padding: 2px 6px;
  border: 1px solid var(--blue); border-radius: 4px;
  outline: none; background: var(--surface); color: var(--ink);
  font-family: var(--font-sans);
}
.history-save-btn {
  background: var(--blue-2); color: white; border: none;
  border-radius: 4px; padding: 2px 6px; cursor: pointer; font-size: 12px;
}

.history-cancel-btn {
  background: transparent;
  color: var(--ink-3);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 2px 6px;
  cursor: pointer;
  font-size: 12px;
}
.history-cancel-btn:hover { background: var(--bg-2); color: var(--ink); }

.history-item-actions { display: flex; gap: 2px; flex-shrink: 0; opacity: 0; transition: opacity .15s; }
.history-item:hover .history-item-actions { opacity: 1; }
.history-action-btn {
  width: 22px; height: 22px;
  display: flex; align-items: center; justify-content: center;
  background: transparent; border: 1px solid transparent;
  border-radius: 5px; color: var(--ink-3); cursor: pointer; transition: all .15s;
}
.history-action-btn:hover { background: var(--bg-3); border-color: var(--line); color: var(--ink); }
.history-action-btn.delete:hover { background: #FCEBEB; border-color: #F7C1C1; color: #E24B4A; }
.history-new-btn {
  display: flex; align-items: center; gap: 6px; justify-content: center;
  margin: 8px; padding: 8px;
  background: var(--bg-2); border: 1px dashed var(--line);
  border-radius: 8px; color: var(--ink-2); cursor: pointer;
  font-size: 12.5px; font-weight: 500; font-family: var(--font-sans);
  transition: all .15s; flex-shrink: 0;
}
.history-new-btn:hover { background: var(--blue-tint); border-color: var(--blue-line); color: var(--blue-2); }

/* 面板滑入动画 */
.slide-left-enter-active, .slide-left-leave-active { transition: transform .22s ease, opacity .22s ease; }
.slide-left-enter-from, .slide-left-leave-to { transform: translateX(-100%); opacity: 0; }

/* ── Header ── */
.dlg-header {
  padding: 12px 16px; border-bottom: 1px solid var(--line);
  display: flex; align-items: center; justify-content: space-between;
  background: linear-gradient(180deg, var(--bg-2), var(--surface)); flex-shrink: 0;
}
.dlg-header-left { display: flex; align-items: center; gap: 10px; }
.ai-avatar {
  width: 32px; height: 32px; flex-shrink: 0;
  border-radius: 10px; background: linear-gradient(135deg, var(--blue), var(--blue-2));
  display: flex; align-items: center; justify-content: center; position: relative;
}
.ai-avatar.sm { width: 26px; height: 26px; border-radius: 8px; }
.thinking-dot {
  position: absolute; right: -3px; bottom: -3px;
  width: 10px; height: 10px; border-radius: 50%;
  background: oklch(0.72 0.12 145); border: 2px solid var(--surface);
}
.dlg-title { font-weight: 600; font-size: 13.5px; display: flex; align-items: center; gap: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px; }
.dlg-badge { font-size: 10px; font-family: var(--font-mono); color: var(--blue-2); background: var(--blue-tint); padding: 1.5px 6px; border-radius: 4px; font-weight: 500; flex-shrink: 0; }
.dlg-sub { font-size: 11px; color: var(--ink-3); margin-top: 1px; }
.dlg-actions { display: flex; gap: 6px; }
.hdr-btn {
  width: 28px; height: 28px; background: transparent;
  border: 1px solid var(--line); border-radius: 8px;
  color: var(--ink-2); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.hdr-btn:hover { background: var(--bg-2); }

/* ── Messages ── */
.dlg-messages { flex: 1; overflow-y: auto; padding: 16px 18px 8px; min-height: 0; display: flex; flex-direction: column; }
.msg-row { display: flex; gap: 10px; margin-bottom: 14px; align-items: flex-start; animation: fadeUp .3s ease-out both; }
.msg-row.user { flex-direction: row-reverse; }
@keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.user-avatar { width: 26px; height: 26px; border-radius: 8px; background: var(--bg-3); border: 1px solid var(--line); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; color: var(--ink-2); flex-shrink: 0; }
.msg-content { max-width: 78%; display: flex; flex-direction: column; gap: 2px; }
.msg-content.user { align-items: flex-end; }
.msg-quote { display: flex; align-items: flex-start; gap: 6px; padding: 5px 10px; background: var(--bg-2); border-radius: 6px; margin-bottom: 2px; }
.quote-bar { width: 2.5px; min-height: 16px; background: var(--blue-2); border-radius: 2px; flex-shrink: 0; margin-top: 2px; }
.quote-text { font-size: 11.5px; color: var(--ink-3); line-height: 1.5; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.bubble { padding: 10px 14px; border-radius: 12px; font-size: 13.5px; line-height: 1.6; color: var(--ink); word-break: break-word; }
.bubble.ai { background: var(--blue-tint); border: 1px solid var(--blue-line); border-top-left-radius: 4px; }
.bubble.user { background: var(--surface); border: 1px solid var(--line); border-top-right-radius: 4px; }
.msg-actions { display: flex; align-items: center; justify-content: space-between; padding: 0 4px; opacity: 0; transition: opacity .15s; gap: 8px; }
.msg-actions.visible { opacity: 1; }
.msg-time { font-size: 10.5px; color: var(--ink-3); font-family: var(--font-mono); }
.action-btns { display: flex; gap: 3px; }
.action-btn { width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; background: transparent; border: 1px solid transparent; border-radius: 5px; color: var(--ink-3); cursor: pointer; transition: all .15s; }
.action-btn:hover { background: var(--bg-2); border-color: var(--line); color: var(--ink); }
.action-btn.delete:hover {
  background: #FCEBEB;
  border-color: #F7C1C1;
  color: #E24B4A;
}

/* ── Quote preview ── */
.quote-preview { display: flex; align-items: center; justify-content: space-between; padding: 7px 14px; background: var(--blue-tint); border-top: 1px solid var(--blue-line); gap: 8px; flex-shrink: 0; }
.quote-preview-content { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
.quote-preview-bar { width: 2.5px; height: 20px; background: var(--blue-2); border-radius: 2px; flex-shrink: 0; }
.quote-preview-text { font-size: 12px; color: var(--blue-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.quote-clear { background: transparent; border: none; color: var(--ink-3); cursor: pointer; font-size: 12px; padding: 2px 4px; border-radius: 4px; flex-shrink: 0; }
.quote-clear:hover { color: var(--ink); background: var(--bg-2); }

/* ── Dots / Chips / Mode ── */
.dot { width: 6px; height: 6px; border-radius: 50%; background: var(--blue-2); display: inline-block; animation: blink 1.2s ease-in-out infinite; }
@keyframes blink { 0%, 60%, 100% { opacity: 1; transform: translateY(0); } 30% { opacity: 0.4; transform: translateY(-3px); } }
.chips-wrap { display: flex; gap: 6px; padding: 10px 18px 10px; flex-wrap: wrap; flex-shrink: 0; align-items: center; }
.chips-loading { display: flex; gap: 6px; }
.chip-skeleton {
  height: 28px; width: 80px;
  background: var(--bg-3); border-radius: 999px;
  animation: shimmer 1.2s ease-in-out infinite;
}
@keyframes shimmer {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}
.chip-refresh {
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-2); border: 1px solid var(--line);
  border-radius: 999px; color: var(--ink-3);
  cursor: pointer; transition: all .15s; flex-shrink: 0;
}
.chip-refresh:hover { background: var(--blue-tint); border-color: var(--blue-line); color: var(--blue-2); }
.chip { font-size: 11.5px; padding: 5px 10px; background: var(--bg-2); border: 1px solid var(--line); border-radius: 999px; color: var(--ink-2); cursor: pointer; font-weight: 500; font-family: var(--font-sans); transition: all .15s; }
.chip:hover { background: var(--blue-tint); border-color: var(--blue-line); color: var(--blue-2); }
.input-toolbar { display: flex; align-items: center; justify-content: space-between; padding: 0 0 8px; gap: 8px; }
.mode-switch { display: flex; gap: 4px; }
.mode-btn { display: inline-flex; align-items: center; gap: 5px; padding: 5px 12px; font-size: 12px; font-weight: 500; background: var(--bg-2); border: 1px solid var(--line); border-radius: 999px; color: var(--ink-3); cursor: pointer; font-family: var(--font-sans); transition: all .15s; }
.mode-btn.active { background: var(--blue-tint); border-color: var(--blue-line); color: var(--blue-2); }
.mode-btn:not(.active):hover { background: var(--bg-3); color: var(--ink-2); }
.mode-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 16px; height: 16px; padding: 0 4px; background: var(--blue-2); color: white; font-size: 10px; font-weight: 600; border-radius: 999px; margin-left: 2px; }
.mode-btn:not(.active) .mode-badge { background: var(--ink-3); }

/* ── Input ── */
.input-wrap { padding: 12px; border-top: 1px solid var(--line); background: var(--bg-2); flex-shrink: 0; }
.input-box { display: flex; align-items: flex-end; gap: 8px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 8px 10px 8px 14px; transition: border-color .15s, box-shadow .15s; }
.input-box:focus-within { border-color: var(--blue); box-shadow: 0 0 0 3px oklch(0.72 0.085 235 / 0.15); }
.input-box textarea { flex: 1; border: none; outline: none; resize: none; font-size: 13px; line-height: 22px; font-family: var(--font-sans); background: transparent; color: var(--ink); padding: 5px 0; min-height: 22px; max-height: 110px; overflow-y: hidden; }
.input-box textarea::placeholder { color: var(--ink-3); }
.send-btn { background: var(--blue-2); color: white; border: none; border-radius: 8px; padding: 7px 12px; font-size: 12.5px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; font-family: var(--font-sans); transition: opacity .15s; flex-shrink: 0; }
.send-btn:disabled { background: var(--bg-3); color: var(--ink-3); cursor: not-allowed; }
.send-btn:not(:disabled):hover { opacity: 0.85; }
.abort-btn { background: #FCEBEB; color: #E24B4A; border: 1px solid #F7C1C1; border-radius: 8px; padding: 7px 12px; font-size: 12.5px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; font-family: var(--font-sans); flex-shrink: 0; transition: all .15s; }
.abort-btn:hover { background: #F7C1C1; }
.style-switch { display: flex; gap: 2px; background: var(--bg-3); border: 1px solid var(--line); border-radius: 999px; padding: 2px; flex-shrink: 0; }
.style-btn { padding: 3px 10px; font-size: 11.5px; font-weight: 500; background: transparent; border: none; border-radius: 999px; color: var(--ink-3); cursor: pointer; font-family: var(--font-sans); transition: all .15s; white-space: nowrap; }
.style-btn.active { background: var(--surface); color: var(--ink); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.style-btn:not(.active):hover { color: var(--ink-2); }
.fade-slide-enter-active, .fade-slide-leave-active { transition: opacity .18s ease, transform .18s ease; }
.fade-slide-enter-from, .fade-slide-leave-to { opacity: 0; transform: translateX(6px); }
.fade-enter-active, .fade-leave-active { transition: opacity .2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>