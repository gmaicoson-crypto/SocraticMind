<template>
  <div class="dialogue-wrap">

    <DialogueHistoryPanel
      :show="showHistory"
      :chat-mode="chatMode"
      :sessions="currentSessions"
      :current-session-id="currentSessionId"
      :editing-session-id="editingSessionId"
      :editing-name="editingName"
      @close="showHistory = false"
      @switch="switchSession"
      @new-session="newSession"
      @start-edit="startEdit"
      @cancel-edit="editingSessionId = null"
      @save-name="saveSessionName"
      @delete="deleteSession"
      @update:editing-name="editingName = $event"
    />

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
          </div>
          <div class="dlg-sub">{{ isThinking ? '正在思考…' : '通过提问引导你发现答案' }}</div>
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

    <TopicNameBar
      v-if="chatMode === 'socratic' && currentSession?.topicId"
      :topic-title="currentSession.topicTitle ?? ''"
      :editing="editingTopicName"
      :editing-value="editingTopicInput"
      @start-edit="startTopicEdit"
      @save="saveTopicName"
      @cancel="editingTopicName = false"
      @update:editing-value="editingTopicInput = $event"
    />

    <MessageList
      ref="messageListRef"
      :messages="messages"
      :streaming-text="streamingText"
      :streaming-choices="streamingChoices"
      :is-thinking="isThinking"
      :user-initial="userInitial"
      @delete="deleteMessage"
      @retry="retryAt"
      @quote="quoteMessage"
      @select-choice="sendChoiceText"
    />

    <DialogueInputBar
      ref="inputBarRef"
      v-model:input="input"
      v-model:chat-mode="chatMode"
      v-model:ai-style="aiStyle"
      :ai-style-options="aiStyleOptions"
      :chips="chips"
      :chips-loading="chipsLoading"
      :quoted-text="quotedText"
      :is-thinking="isThinking"
      :is-generating="isGenerating"
      :socratic-badge="socraticBadge"
      :normal-badge="normalBadge"
      :placeholder="placeholder"
      @send="send"
      @abort="abortChat"
      @clear-quote="quotedText = ''"
      @refresh-chips="loadSuggestions(true)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed, onMounted, onBeforeUnmount } from 'vue'
import { useLearningStore } from '../stores/learning'
import type { Message } from '../types'
import { chatStream, getSuggestions, deleteMessages, getAllMessages } from '../api/chat'
import { generateTopic, updateTopicTitle } from '../api/topic'
import { now, nowDate, genId, extractTopic, isNewTopicIntent, isConfirmation } from '../utils/chat'

import DialogueHistoryPanel from './dialogue/DialogueHistoryPanel.vue'
import TopicNameBar from './dialogue/TopicNameBar.vue'
import MessageList from './dialogue/MessageList.vue'
import DialogueInputBar from './dialogue/DialogueInputBar.vue'

interface Session {
  id: string
  name: string
  messages: Message[]
  updatedAt: string
  topicId?: number
  topicTitle?: string
}

const store = useLearningStore()

// 子组件引用：MessageList 暴露 scrollToBottom，InputBar 暴露 reset/focus
const messageListRef = ref<InstanceType<typeof MessageList> | null>(null)
const inputBarRef = ref<InstanceType<typeof DialogueInputBar> | null>(null)

const input = ref('')
const isThinking = ref(false)
const isGenerating = ref(false)
const streamingText = ref('')
const streamingChoices = ref<{ label: string; text: string }[] | null>(null)
const quotedText = ref('')
const showHistory = ref(false)
const editingSessionId = ref<string | null>(null)
const editingName = ref('')

let abortController: AbortController | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
let pendingMsgIds: { user: number; ai: number } | null = null

const pendingTopicName = ref('')
const editingTopicName = ref(false)
const editingTopicInput = ref('')

const userInitial = computed(() => (store.userInfo?.username ?? '学').slice(0, 1))
const currentTopicId = computed(() => Number(store.activeTopicId) || 0)
const chatMode = ref<'socratic' | 'normal'>('socratic')
const aiStyleOptions = ['温和', '标准', '严格'] as const
const aiStyle = ref<string>(store.userInfo?.ai_style ?? '标准')

// 会话/缓存按用户隔离：换账号即看不到上一账号的历史，避免共享浏览器串号
const userScope = computed(() => store.userInfo?.id ? `u${store.userInfo.id}` : 'guest')
const STORAGE_KEY_SOCRATIC_SESSIONS = computed(() => `sm_sessions_socratic_${userScope.value}`)
const STORAGE_KEY_NORMAL_SESSIONS = computed(() => `sm_sessions_normal_${userScope.value}`)
const STORAGE_KEY_SOCRATIC_CUR = computed(() => `sm_session_cur_socratic_${userScope.value}`)
const STORAGE_KEY_NORMAL_CUR = computed(() => `sm_session_cur_normal_${userScope.value}`)
const STORAGE_KEY_CHIPS_SOCRATIC = computed(() => `sm_chips_socratic_${userScope.value}`)
const STORAGE_KEY_CHIPS_NORMAL = computed(() => `sm_chips_normal_${userScope.value}`)
const STORAGE_VERSION_KEY = 'sm_data_version'
const CURRENT_DATA_VERSION = '3'  // v3: 会话按用户作用域隔离

// 一次性迁移：清掉 v1/v2 共享键，避免新账号看到旧账号残留
if (localStorage.getItem(STORAGE_VERSION_KEY) !== CURRENT_DATA_VERSION) {
  for (const k of [
    'sm_sessions_socratic', 'sm_sessions_normal',
    'sm_session_cur_socratic', 'sm_session_cur_normal',
    'sm_chips_socratic', 'sm_chips_normal',
  ]) localStorage.removeItem(k)
  localStorage.setItem(STORAGE_VERSION_KEY, CURRENT_DATA_VERSION)
}

const chips = ref<string[]>(loadCachedChips('socratic'))
const chipsLoading = ref(false)

const socraticSessions = ref<Session[]>(loadSessions(STORAGE_KEY_SOCRATIC_SESSIONS.value, 'socratic'))
const normalSessions = ref<Session[]>(loadSessions(STORAGE_KEY_NORMAL_SESSIONS.value, 'normal'))

const socraticCurrentId = ref<string>(loadCurrentId(STORAGE_KEY_SOCRATIC_CUR.value, socraticSessions.value))
const normalCurrentId = ref<string>(loadCurrentId(STORAGE_KEY_NORMAL_CUR.value, normalSessions.value))

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

// 模式切换 badge：当前模式下"非欢迎语"消息数量
const socraticBadge = computed(() => Math.max(0, currentSocraticSession.value.messages.length - 1))
const normalBadge = computed(() => Math.max(0, currentNormalSession.value.messages.length - 1))

const placeholder = computed(() => chatMode.value === 'socratic'
  ? '回答问题，或问我一个反问…  (Enter 发送 · Shift+Enter 换行)'
  : '随便问我什么…  (Enter 发送 · Shift+Enter 换行)'
)

const messages = computed({
  get: () => currentSession.value?.messages ?? [],
  set: (val) => {
    if (!currentSession.value) return
    currentSession.value.messages = val
    currentSession.value.updatedAt = nowDate()
    saveSessions()
  },
})

const defaultChips = {
  socratic: ['我想学 Python', '教我机器学习', '讲讲数据结构', '学习 Web 开发'],
  normal: ['今天天气怎么样', '推荐一部电影', '给我讲个笑话', '聊聊最近的新闻'],
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
  } catch (err) {
    console.warn(`本地会话 ${key} 解析失败，回退到默认会话`, err)
  }
  return [defaultSession(mode)]
}

function loadCurrentId(key: string, sessions: Session[]): string {
  try {
    const id = localStorage.getItem(key)
    if (id && sessions.find(s => s.id === id)) return id
  } catch (err) {
    console.warn(`本地当前会话 id 读取失败，回退到首个会话`, err)
  }
  return sessions[0].id
}

function loadCachedChips(mode: 'socratic' | 'normal'): string[] {
  const key = mode === 'socratic' ? STORAGE_KEY_CHIPS_SOCRATIC.value : STORAGE_KEY_CHIPS_NORMAL.value
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw)
  } catch (err) {
    console.warn(`建议词缓存 ${key} 解析失败`, err)
  }
  return []
}

function saveCachedChips(mode: 'socratic' | 'normal', list: string[]) {
  const key = mode === 'socratic' ? STORAGE_KEY_CHIPS_SOCRATIC.value : STORAGE_KEY_CHIPS_NORMAL.value
  localStorage.setItem(key, JSON.stringify(list))
}

async function loadSuggestions(force = false) {
  const cached = loadCachedChips(chatMode.value)
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
  // 防抖批量写：连续修改会话只触发一次 localStorage 写入，避免大量 JSON 序列化
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    localStorage.setItem(STORAGE_KEY_SOCRATIC_SESSIONS.value, JSON.stringify(socraticSessions.value))
    localStorage.setItem(STORAGE_KEY_NORMAL_SESSIONS.value, JSON.stringify(normalSessions.value))
    localStorage.setItem(STORAGE_KEY_SOCRATIC_CUR.value, socraticCurrentId.value)
    localStorage.setItem(STORAGE_KEY_NORMAL_CUR.value, normalCurrentId.value)
  }, 300)
}

// 主题 ↔ 学习对话 1:1 绑定：找不到就懒创建一个，名字默认取主题名
function findOrCreateTopicSession(topicId: number): Session {
  const existing = socraticSessions.value.find(s => s.topicId === topicId)
  if (existing) return existing
  const topic = store.topics.find(t => Number(t.id) === topicId)
  const title = topic?.title ?? '新学习对话'
  const session: Session = {
    id: genId(),
    name: title.slice(0, 12),
    messages: [{
      role: 'ai',
      text: `这是关于「**${title}**」的专属学习对话 ✦\n\n点击右侧知识图谱中的节点开始学习，或继续提问深入这个主题。`,
      time: now(),
    }],
    updatedAt: nowDate(),
    topicId,
    topicTitle: topic?.title,
  }
  socraticSessions.value = [session, ...socraticSessions.value]
  return session
}

function pushMessage(msg: Message) {
  if (!currentSession.value) return
  currentSession.value.messages.push(msg)
  currentSession.value.updatedAt = nowDate()
  if (msg.role === 'user' && currentSession.value.name.startsWith('新')) {
    currentSession.value.name = msg.text.slice(0, 12) + (msg.text.length > 12 ? '…' : '')
  }
  saveSessions()
}

function scrollToBottom() {
  messageListRef.value?.scrollToBottom()
}

function switchSession(id: string) {
  if (chatMode.value === 'socratic') socraticCurrentId.value = id
  else normalCurrentId.value = id
  showHistory.value = false
  saveSessions()
  scrollToBottom()
}

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

// 从数据库拉取全部历史，增量合并到已有会话（按 db_id 去重）
async function syncFromDB() {
  try {
    const msgs = await getAllMessages()
    if (!msgs.length) return

    const existingIds = new Set<number>()
    for (const s of [...socraticSessions.value, ...normalSessions.value]) {
      for (const m of s.messages) {
        if (m.db_id != null) existingIds.add(m.db_id)
      }
    }

    const newMsgs = msgs.filter(m => !existingIds.has(m.id))
    if (!newMsgs.length) return

    const socraticNew = newMsgs.filter(m => m.mode === 'socratic')
    const normalNew = newMsgs.filter(m => m.mode !== 'socratic')

    for (const m of socraticNew) {
      const nk = m.node_key || 'unknown'
      let session = socraticSessions.value.find(s => s.topicTitle === nk || s.name === nk.slice(0, 12))
      if (!session) {
        session = { id: genId(), name: nk.slice(0, 12), messages: [], updatedAt: nowDate(), topicTitle: nk }
        socraticSessions.value.push(session)
      }
      session.messages.push({
        role: (m.role === 'ai' ? 'ai' : 'user') as 'ai' | 'user',
        text: m.content, time: m.created_at || now(), db_id: m.id,
      })
      session.updatedAt = m.created_at || session.updatedAt
    }
    for (const s of socraticSessions.value) {
      s.messages.sort((a, b) => (a.time || '').localeCompare(b.time || ''))
    }

    if (normalNew.length) {
      let normalSession = normalSessions.value.find(s => s.name === '历史对话' && s.messages.length > 1)
      if (!normalSession) {
        normalSession = { id: genId(), name: '历史对话', messages: [], updatedAt: nowDate() }
        normalSessions.value.unshift(normalSession)
      }
      for (const m of normalNew) {
        normalSession.messages.push({
          role: (m.role === 'ai' ? 'ai' : 'user') as 'ai' | 'user',
          text: m.content, time: m.created_at || now(), db_id: m.id,
        })
      }
      normalSession.updatedAt = normalNew[normalNew.length - 1]?.created_at || normalSession.updatedAt
      normalSession.messages.sort((a, b) => (a.time || '').localeCompare(b.time || ''))
    }

    saveSessions()
  } catch (err) {
    console.warn('从数据库同步历史消息失败', err)
  }
}

onMounted(() => {
  const cached = loadCachedChips(chatMode.value)
  chips.value = cached.length > 0 ? cached : defaultChips[chatMode.value]

  // 始终从数据库同步全部历史（增量合并，按 id 去重）
  if (userScope.value !== 'guest') {
    syncFromDB()
  }
})

watch(chatMode, () => {
  // 切模式仅读缓存，避免来回切换都打 AI；缓存为空才走默认词
  const cached = loadCachedChips(chatMode.value)
  chips.value = cached.length > 0 ? cached : defaultChips[chatMode.value]
  scrollToBottom()
})

// 主题 → 会话自动切换：activeTopicId 或 chatMode 变化都重新对齐
// 用 Sidebar 点击主题、TopBar 搜索跳转、生成新主题等都会触发 setActiveTopic
watch([() => store.activeTopicId, chatMode], async () => {
  if (chatMode.value !== 'socratic') return
  const numId = Number(store.activeTopicId)
  if (!numId) return
  const session = findOrCreateTopicSession(numId)
  if (socraticCurrentId.value !== session.id) {
    socraticCurrentId.value = session.id
    showHistory.value = false
    saveSessions()
    scrollToBottom()
  }
  // 消费"待概览"标记：刚生成 / 加入推荐主题时由发起方设置；首屏挂载不会带 flag
  if (store.pendingTopicOverviewId === numId) {
    const title = store.topics.find(t => Number(t.id) === numId)?.title
    store.requestTopicOverview(null)  // 先清，避免重复触发
    if (title) await streamOverview('topic', title)
  }
}, { immediate: true })

// 主题列表变化时同步会话名 + 清理已删除主题对应的孤儿会话
watch(() => store.topics, (topics) => {
  const validIds = new Set(topics.map(t => Number(t.id)))
  let mutated = false
  const next: Session[] = []
  for (const s of socraticSessions.value) {
    if (s.topicId == null) {
      next.push(s)
      continue
    }
    if (!validIds.has(s.topicId)) {
      // 主题被删除 → 同步删除其绑定会话
      mutated = true
      continue
    }
    const t = topics.find(x => Number(x.id) === s.topicId)
    if (t && (s.topicTitle !== t.title || s.name !== t.title.slice(0, 12))) {
      // 主题改名 → 会话名同步
      s.topicTitle = t.title
      s.name = t.title.slice(0, 12)
      mutated = true
    }
    next.push(s)
  }
  // 至少留一个会话兜底（未绑定主题的默认对话）
  if (next.length === 0) {
    next.push(defaultSession('socratic'))
    mutated = true
  }
  if (mutated) {
    socraticSessions.value = next
    if (!next.find(s => s.id === socraticCurrentId.value)) {
      socraticCurrentId.value = next[0].id
    }
    saveSessions()
  }
})

function deleteSession(id: string) {
  const sessions = chatMode.value === 'socratic' ? socraticSessions.value : normalSessions.value
  const session = sessions.find(s => s.id === id)
  if (session) {
    const ids = session.messages.flatMap(m =>
      [m.db_id, m.paired_db_id].filter((x): x is number => x !== undefined)
    )
    if (ids.length > 0) deleteMessages(ids).catch(() => {})
  }

  if (chatMode.value === 'socratic') {
    if (socraticSessions.value.length <= 1) {
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

function startEdit(session: Session) {
  editingSessionId.value = session.id
  editingName.value = session.name
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

function quoteMessage(msg: Message) {
  // 引用时去掉 markdown 噪声字符，截断 200 字防过长
  quotedText.value = msg.text.replace(/[#*`>]/g, '').trim().slice(0, 200)
  nextTick(() => inputBarRef.value?.focus())
}

function deleteMessage(index: number) {
  if (!currentSession.value) return
  if (index === 0) return  // 第一条欢迎消息不允许删除
  const msg = currentSession.value.messages[index]
  const ids = [msg.db_id, msg.paired_db_id].filter((id): id is number => id !== undefined)
  if (ids.length > 0) deleteMessages(ids).catch(() => {})
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
  streamingChoices.value = null
  isThinking.value = false
  if (partial) {
    const { cleanText, choices } = parseChoices(partial)
    pushMessage({ role: 'ai', text: cleanText, time: now(), choices: choices ?? undefined })
  }
  scrollToBottom()
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

function buildUserInput(v: string): string {
  if (quotedText.value) {
    const q = quotedText.value
    quotedText.value = ''
    return `> ${q}\n\n${v}`
  }
  return v
}

function startTopicEdit() {
  editingTopicInput.value = currentSession.value?.topicTitle ?? ''
  editingTopicName.value = true
}

async function saveTopicName() {
  const newTitle = editingTopicInput.value.trim()
  const topicId = currentSession.value?.topicId
  if (!newTitle || !topicId) { editingTopicName.value = false; return }
  try {
    await updateTopicTitle(topicId, newTitle)
    if (currentSession.value) {
      currentSession.value.topicTitle = newTitle
      currentSession.value.name = newTitle.slice(0, 12)
      saveSessions()
    }
    await store.fetchTopicsOnly()
  } catch (err) {
    console.warn('更新主题名称失败', err)
  }
  editingTopicName.value = false
}

// 把流式片段里的 [MASTERED]/[CONFIRM_MASTER] 信号 token 剔掉
function stripSignals(s: string): string {
  return s.replace(/\[MASTERED\]/g, '').replace(/\[CONFIRM_MASTER\]/g, '')
}

// 去掉 [CHOICES]...[ECHOICES] 块，用于流式展示
function stripChoicesBlock(s: string): string {
  return s.replace(/\s*\[CHOICES\][\s\S]*?\[ECHOICES\]\s*/g, '')
}

// 流式过程中检测完整的 [CHOICES]...[ECHOICES] 块，有则提前解析出选项
function checkStreamingChoices() {
  if (!streamingChoices.value) {
    const { choices } = parseChoices(streamingText.value)
    if (choices) streamingChoices.value = choices
  }
}

// 从 AI 回复中提取 [CHOICES]...[ECHOICES] 选项块，返回清洗后的正文 + 选项数组
function parseChoices(text: string): { cleanText: string; choices: { label: string; text: string }[] | null } {
  const match = text.match(/\[CHOICES\]([\s\S]*?)\[ECHOICES\]/)
  if (!match) return { cleanText: text, choices: null }
  const cleanText = text.replace(/\s*\[CHOICES\][\s\S]*?\[ECHOICES\]\s*/g, '').trim()
  const lines = match[1].trim().split('\n').filter(Boolean)
  const choices = lines
    .map(line => {
      const m = line.match(/^([A-F])[.、]\s*(.+?)(?:\s*[—\-–:：]\s*(.+))?$/)
      if (!m) return null
      return { label: m[1], text: m[2] + (m[3] ? ` —— ${m[3]}` : '') }
    })
    .filter((c): c is { label: string; text: string } => c !== null)
  return { cleanText, choices: choices.length >= 2 ? choices : null }
}

// 用户点击选项按钮时，直接作为用户消息发送，无需手动输入
function sendChoiceText(choiceText: string) {
  if (isGenerating.value) return
  // 流式进行中点击选项：先中止当前流，commit 已有内容，再发送选择
  if (isThinking.value) abortChat()
  input.value = choiceText
  send()
}

async function send() {
  const v = input.value.trim()
  if (!v || isThinking.value || isGenerating.value) return

  if (chatMode.value === 'socratic') {
    store.recordLearning()
  }

  inputBarRef.value?.reset()
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
        streamingText.value = stripSignals(streamingText.value + chunk)
        checkStreamingChoices()
        scrollToBottom()
      },
      () => {
        const t = stripSignals(streamingText.value).trim()
        streamingText.value = ''; streamingChoices.value = null; isThinking.value = false
        if (t) {
          const { cleanText, choices } = parseChoices(t)
          pushMessage({ role: 'ai', text: cleanText, time: now(), choices: choices ?? undefined })
        }
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

  // 同一对话只能绑定一个主题（避免历史记录串台）
  if (currentSession.value?.topicId && isNewTopicIntent(v)) {
    pushMessage({ role: 'ai', text: `本对话已绑定「**${currentSession.value.topicTitle}**」主题，每个学习对话只能学习一个主题。\n\n如需学习新主题，请点击右上角「＋」新建对话。`, time: now() })
    scrollToBottom()
    return
  }

  // 待确认主题：上一轮 AI 询问"确认生成吗？"，此轮判断用户回答
  if (pendingTopicName.value) {
    if (isConfirmation(v)) {
      const topicName = pendingTopicName.value
      pendingTopicName.value = ''
      await handleGenerateTopic(topicName)
      return
    }
    pendingTopicName.value = ''
  } else if (isNewTopicIntent(v)) {
    const topicName = extractTopic(v)
    if (topicName.length >= 2) {
      pendingTopicName.value = topicName
      pushMessage({ role: 'ai', text: `好的！我将为你生成「**${topicName}**」的专属知识图谱，确认生成吗？\n\n回复**"确认"**开始生成，或直接继续聊天取消。`, time: now() })
      scrollToBottom()
      return
    }
  }

  if (!store.activeNode) {
    const boundTitle = currentSession.value?.topicTitle
    const hint = boundTitle
      ? `这是「**${boundTitle}**」的专属对话。请在右侧图谱中点击一个节点，针对该主题的具体知识点来对话 👉`
      : '请先在右侧图谱中点击一个节点，我们针对具体知识点来对话 👉'
    pushMessage({ role: 'ai', text: hint, time: now() })
    scrollToBottom()
    return
  }

  // 节点必须属于当前会话绑定的主题；否则提示用户先选对主题的节点
  if (currentSession.value?.topicId && !store.nodes.some(n => n.id === store.activeNode!.id)) {
    pushMessage({
      role: 'ai',
      text: `当前对话绑定的是「**${currentSession.value.topicTitle}**」主题，请在该主题的图谱里选一个节点继续。`,
      time: now(),
    })
    scrollToBottom()
    return
  }

  isThinking.value = true
  streamingText.value = ''
  scrollToBottom()
  const history = messages.value.slice(-10).map(m => ({ role: m.role as 'ai' | 'user', content: m.text }))
  const userMsgRef = currentSession.value!.messages[currentSession.value!.messages.length - 1]

  chatStream(
    store.activeNode.id, currentTopicId.value, userInput, history, 'socratic', aiStyle.value,
    (chunk) => {
      streamingText.value = stripSignals(streamingText.value + chunk)
      checkStreamingChoices()
      scrollToBottom()
    },
    () => {
      const t = stripSignals(streamingText.value).trim()
      streamingText.value = ''; streamingChoices.value = null; isThinking.value = false
      if (t) {
        const { cleanText, choices } = parseChoices(t)
        const aiMsg: Message = { role: 'ai', text: cleanText, time: now(), choices: choices ?? undefined }
        if (pendingMsgIds) {
          userMsgRef.db_id = pendingMsgIds.user
          aiMsg.db_id = pendingMsgIds.ai
          pendingMsgIds = null
        }
        pushMessage(aiMsg)
      }
      scrollToBottom()
    },
    (err) => {
      if (err?.name === 'AbortError') return
      pushMessage({ role: 'ai', text: '抱歉，连接失败，请重试。', time: now() })
      streamingText.value = ''; isThinking.value = false; scrollToBottom()
    },
    abortController,
    handleSignal,
    (userMsgId, aiMsgId) => { pendingMsgIds = { user: userMsgId, ai: aiMsgId } },
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
      streamingText.value = stripSignals(streamingText.value + chunk)
      checkStreamingChoices()
      scrollToBottom()
    },
    () => {
      const t = stripSignals(streamingText.value).trim()
      streamingText.value = ''; streamingChoices.value = null; isThinking.value = false
      if (t) {
        const { cleanText, choices } = parseChoices(t)
        pushMessage({ role: 'ai', text: cleanText, time: now(), choices: choices ?? undefined })
      }
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
    // 先把当前未绑定的会话"认领"为新主题的会话，再 setActiveTopic 触发 watcher
    if (currentSession.value && currentSession.value.topicId == null) {
      currentSession.value.topicId = topic.id
      currentSession.value.topicTitle = topic.title
      currentSession.value.name = topic.title.slice(0, 12)
      saveSessions()
    }
    // 先标记这个主题需要概览，再切主题；watcher 切完会话后会消费这个标记
    store.requestTopicOverview(topic.id)
    await store.fetchTopics()
    await store.setActiveTopic(String(topic.id))
    pushMessage({ role: 'ai', text: `✦ 知识图谱已生成！共 **${topic.total_nodes}** 个知识节点。\n\n下面我先给你一个整体介绍 👇`, time: now() })
    scrollToBottom()
  } catch {
    pushMessage({ role: 'ai', text: '生成失败，请重试或换个主题名称。', time: now() })
  } finally {
    isGenerating.value = false
    scrollToBottom()
  }
}

// 统一的概览流：复用现有 chatStream，仅传 kind 改变 prompt
// identifier 含义因 kind 而异：
//   topic → 主题标题（后端 topic_overview 分支直接读 req.node_key 当主题名）
//   node  → 节点的 node_key（后端走 DB 查询取出 label/sub 给 NODE_OVERVIEW prompt）
function streamOverview(kind: 'topic' | 'node', identifier: string): Promise<void> {
  return new Promise((resolve) => {
    isThinking.value = true
    streamingText.value = ''
    abortController = new AbortController()
    const apiKind = kind === 'topic' ? 'topic_overview' : 'node_overview'
    chatStream(
      identifier, currentTopicId.value, '',
      [],
      'socratic', aiStyle.value,
      (chunk) => {
        streamingText.value = stripSignals(streamingText.value + chunk)
        checkStreamingChoices()
        scrollToBottom()
      },
      () => {
        const t = stripSignals(streamingText.value).trim()
        streamingText.value = ''; streamingChoices.value = null
        isThinking.value = false
        if (t) {
          const { cleanText, choices } = parseChoices(t)
          pushMessage({ role: 'ai', text: cleanText, time: now(), choices: choices ?? undefined })
        }
        scrollToBottom()
        resolve()
      },
      (err) => {
        if (err?.name !== 'AbortError') {
          pushMessage({ role: 'ai', text: '加载概览失败，但你仍可以正常学习。', time: now() })
        }
        streamingText.value = ''
        isThinking.value = false
        scrollToBottom()
        resolve()
      },
      abortController,
      undefined,
      undefined,
      apiKind,
    )
  })
}

watch(() => store.activeNode?.id, async (id) => {
  // 节点切换：先给 100 字概览，再衔接苏格拉底引导问题（已掌握节点直接走复习提问）
  if (!id) return
  if (chatMode.value !== 'socratic') return
  const node = store.activeNode!

  if (node.state === 'mastered') {
    // 已掌握 → 走复习提问，不再走概览
    isThinking.value = true
    streamingText.value = ''
    scrollToBottom()

    const prompt = `用户想复习「${node.label}」（${node.sub}），请用苏格拉底式提问引导用户回顾这个知识点的核心内容。`
    abortController = new AbortController()
    chatStream(
      node.id, currentTopicId.value, prompt,
      [],
      'socratic', aiStyle.value,
      (chunk) => {
        streamingText.value = stripSignals(streamingText.value + chunk)
        checkStreamingChoices()
        scrollToBottom()
      },
      () => {
        const t = stripSignals(streamingText.value).trim()
        streamingText.value = ''; streamingChoices.value = null
        isThinking.value = false
        if (t) {
          const { cleanText, choices } = parseChoices(t)
          const aiMsg: Message = { role: 'ai', text: cleanText, time: now(), choices: choices ?? undefined }
          if (pendingMsgIds) {
            aiMsg.db_id = pendingMsgIds.ai
            aiMsg.paired_db_id = pendingMsgIds.user
            pendingMsgIds = null
          }
          pushMessage(aiMsg)
        }
        scrollToBottom()
      },
      (err) => {
        if (err?.name === 'AbortError') return
        streamingText.value = ''
        isThinking.value = false
      },
      abortController,
      handleSignal,
      (userMsgId, aiMsgId) => { pendingMsgIds = { user: userMsgId, ai: aiMsgId } },
    )
    return
  }

  // 未掌握 → 节点概览（100 字 + 一个引导问题）
  // 后端按 node_key 查 DB 拿到 label/sub，所以这里传 node.id（前端的 KNode.id 即 node_key）
  await streamOverview('node', node.id)
})

onBeforeUnmount(() => {
  // 路由切换时清理：未触发的写盘 timer + 未结束的流式请求
  if (saveTimer) clearTimeout(saveTimer)
  abortController?.abort()
})
</script>

<style scoped>
.dialogue-wrap {
  display: flex; flex-direction: column;
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--radius); overflow: hidden;
  min-height: 0; height: 100%; flex: 1; position: relative;
}

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
.thinking-dot {
  position: absolute; right: -3px; bottom: -3px;
  width: 10px; height: 10px; border-radius: 50%;
  background: oklch(0.72 0.12 145); border: 2px solid var(--surface);
}
.dlg-title {
  font-weight: 600; font-size: 13.5px;
  display: flex; align-items: center; gap: 6px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px;
}

.dlg-sub { font-size: 11px; color: var(--ink-3); margin-top: 1px; }
.dlg-actions { display: flex; gap: 6px; }
.hdr-btn {
  width: 28px; height: 28px; background: transparent;
  border: 1px solid var(--line); border-radius: 8px;
  color: var(--ink-2); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.hdr-btn:hover { background: var(--bg-2); }
</style>
