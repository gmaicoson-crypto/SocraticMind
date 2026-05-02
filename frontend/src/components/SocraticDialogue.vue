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
            <span class="dlg-badge">SOCRATES · v3</span>
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
      :is-thinking="isThinking"
      :user-initial="userInitial"
      @delete="deleteMessage"
      @retry="retryAt"
      @quote="quoteMessage"
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
import { chatStream, getSuggestions, deleteMessages } from '../api/chat'
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
const chips = ref<string[]>(loadCachedChips('socratic'))
const chipsLoading = ref(false)

const STORAGE_KEY_SOCRATIC_SESSIONS = 'sm_sessions_socratic'
const STORAGE_KEY_NORMAL_SESSIONS = 'sm_sessions_normal'
const STORAGE_KEY_SOCRATIC_CUR = 'sm_session_cur_socratic'
const STORAGE_KEY_NORMAL_CUR = 'sm_session_cur_normal'
const STORAGE_KEY_CHIPS_SOCRATIC = 'sm_chips_socratic'
const STORAGE_KEY_CHIPS_NORMAL = 'sm_chips_normal'
const STORAGE_VERSION_KEY = 'sm_data_version'
const CURRENT_DATA_VERSION = '2'  // v2: 引入 db_id 同步，清除不带 db_id 的旧数据

if (localStorage.getItem(STORAGE_VERSION_KEY) !== CURRENT_DATA_VERSION) {
  // 旧数据无 db_id，删除消息时无法同步后端，整体清掉重来
  localStorage.removeItem(STORAGE_KEY_SOCRATIC_SESSIONS)
  localStorage.removeItem(STORAGE_KEY_NORMAL_SESSIONS)
  localStorage.removeItem(STORAGE_KEY_SOCRATIC_CUR)
  localStorage.removeItem(STORAGE_KEY_NORMAL_CUR)
  localStorage.removeItem(STORAGE_KEY_CHIPS_SOCRATIC)
  localStorage.removeItem(STORAGE_KEY_CHIPS_NORMAL)
  localStorage.setItem(STORAGE_VERSION_KEY, CURRENT_DATA_VERSION)
}

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
  const key = mode === 'socratic' ? STORAGE_KEY_CHIPS_SOCRATIC : STORAGE_KEY_CHIPS_NORMAL
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw)
  } catch (err) {
    console.warn(`建议词缓存 ${key} 解析失败`, err)
  }
  return []
}

function saveCachedChips(mode: 'socratic' | 'normal', list: string[]) {
  const key = mode === 'socratic' ? STORAGE_KEY_CHIPS_SOCRATIC : STORAGE_KEY_CHIPS_NORMAL
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

onMounted(() => {
  const cached = loadCachedChips(chatMode.value)
  chips.value = cached.length > 0 ? cached : defaultChips[chatMode.value]
})

watch(chatMode, () => {
  // 切模式仅读缓存，避免来回切换都打 AI；缓存为空才走默认词
  const cached = loadCachedChips(chatMode.value)
  chips.value = cached.length > 0 ? cached : defaultChips[chatMode.value]
  scrollToBottom()
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
  // 把已经 stream 出来的部分内容也保留，避免用户看到"什么都没回"
  const partial = streamingText.value.trim()
  streamingText.value = ''
  isThinking.value = false
  if (partial) pushMessage({ role: 'ai', text: partial, time: now() })
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

// 把流式片段里的 [MASTERED]/[CONFIRM_MASTER] 信号 token 剔掉，只渲染对用户可见的内容
function stripSignals(s: string): string {
  return s.replace(/\[MASTERED\]/g, '').replace(/\[CONFIRM_MASTER\]/g, '')
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
        scrollToBottom()
      },
      () => {
        const t = stripSignals(streamingText.value).trim()
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
    pushMessage({ role: 'ai', text: '请先在右侧图谱中点击一个节点，我们针对具体知识点来对话 👉', time: now() })
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
      scrollToBottom()
    },
    () => {
      const t = stripSignals(streamingText.value).trim()
      streamingText.value = ''; isThinking.value = false
      if (t) {
        const aiMsg: Message = { role: 'ai', text: t, time: now() }
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
      scrollToBottom()
    },
    () => {
      const t = stripSignals(streamingText.value).trim()
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
    if (currentSession.value) {
      currentSession.value.topicId = topic.id
      currentSession.value.topicTitle = topic.title
      if (currentSession.value.name.startsWith('新')) {
        currentSession.value.name = topicName.slice(0, 12)
      }
      saveSessions()
    }
    pushMessage({ role: 'ai', text: `✦ 知识图谱已生成！共 **${topic.total_nodes}** 个知识节点。\n\n右侧图谱已更新，点击蓝色节点开始学习吧！`, time: now() })
  } catch {
    pushMessage({ role: 'ai', text: '生成失败，请重试或换个主题名称。', time: now() })
  } finally {
    isGenerating.value = false
    scrollToBottom()
  }
}

watch(() => store.activeNode?.id, async (id) => {
  // 节点切换：用 AI 自由发挥提问，比固定模板更灵活
  if (!id) return
  if (chatMode.value !== 'socratic') return
  const node = store.activeNode!

  isThinking.value = true
  streamingText.value = ''
  scrollToBottom()

  const prompt = node.state === 'mastered'
    ? `用户想复习「${node.label}」（${node.sub}），请用苏格拉底式提问引导用户回顾这个知识点的核心内容。`
    : `用户开始学习「${node.label}」（${node.sub}），请用苏格拉底式提问引导用户思考这个知识点，从用户已有的生活经验或常识出发。`

  abortController = new AbortController()

  chatStream(
    node.id, currentTopicId.value, prompt,
    [], // 不带历史，新节点开场
    'socratic', aiStyle.value,
    (chunk) => {
      streamingText.value = stripSignals(streamingText.value + chunk)
      scrollToBottom()
    },
    () => {
      const t = stripSignals(streamingText.value).trim()
      streamingText.value = ''
      isThinking.value = false
      if (t) {
        const aiMsg: Message = { role: 'ai', text: t, time: now() }
        if (pendingMsgIds) {
          aiMsg.db_id = pendingMsgIds.ai
          aiMsg.paired_db_id = pendingMsgIds.user  // 关联隐式系统提问的 db 记录
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
.dlg-badge {
  font-size: 10px; font-family: var(--font-mono); color: var(--blue-2);
  background: var(--blue-tint); padding: 1.5px 6px; border-radius: 4px;
  font-weight: 500; flex-shrink: 0;
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
