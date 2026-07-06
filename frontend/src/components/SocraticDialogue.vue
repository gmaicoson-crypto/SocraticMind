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
      :avatar-url="store.userInfo?.avatar_url ?? null"
      :avatar-grad="store.userInfo?.avatar_grad ?? ''"
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
// SocraticDialogue 组件，封装局部界面和交互逻辑。
import { ref, watch, nextTick, computed, onMounted, onBeforeUnmount } from 'vue'
import { useLearningStore } from '../stores/learning'
import type { DialogueSession as Session, Message } from '../types'
import { chatStream, getSuggestions, deleteMessages, deleteChatSession } from '../api/chat'
import { generateTopic, updateTopicTitle } from '../api/topic'
import { now, nowDate, extractTopic, isNewTopicIntent, isConfirmation } from '../utils/chat'
import { useChatSessions } from '../composables/useChatSessions'
import { useChatStream } from '../composables/useChatStream'
import { useTopicDialogue } from '../composables/useTopicDialogue'
import { useDialogueHistory } from '../composables/useDialogueHistory'
import { useSessionTopicChoice } from '../composables/useSessionTopicChoice'

import DialogueHistoryPanel from './dialogue/DialogueHistoryPanel.vue'
import TopicNameBar from './dialogue/TopicNameBar.vue'
import MessageList from './dialogue/MessageList.vue'
import DialogueInputBar from './dialogue/DialogueInputBar.vue'

const store = useLearningStore()
const streamControl = useChatStream()
const { parseChoices, stripSignals, inferSelectedChoices } = useTopicDialogue()
const {
  socraticSessions,
  normalSessions,
  socraticCurrentId,
  normalCurrentId,
  createDefaultSession,
  saveSessions,
  disposeSessionPersistence,
} = useChatSessions()

const messageListRef = ref<InstanceType<typeof MessageList> | null>(null)
const inputBarRef = ref<InstanceType<typeof DialogueInputBar> | null>(null)
let abortController: AbortController | null = null

const input = ref('')
const isThinking = ref(false)
const isGenerating = ref(false)
const streamingText = ref('')
const streamingChoices = ref<{ label: string; text: string }[] | null>(null)
const quotedText = ref('')
const showHistory = ref(false)
const editingSessionId = ref<string | null>(null)
const editingName = ref('')

let pendingMsgIds: { user: number; ai: number } | null = null

let isHydrated = false

const pendingTopicName = ref('')
const editingTopicName = ref(false)
const editingTopicInput = ref('')

const userInitial = computed(() => (store.userInfo?.username ?? '学').slice(0, 1))
const currentTopicId = computed(() => Number(store.activeTopicId) || 0)
const chatMode = ref<'socratic' | 'normal'>('socratic')
const aiStyleOptions = ['温和', '标准', '严格'] as const
const aiStyle = ref<string>(store.userInfo?.ai_style ?? '标准')

const SK_CHIPS_SOCRATIC = 'sm_chips_socratic'
const SK_CHIPS_NORMAL = 'sm_chips_normal'
const deletingSessionIds = new Set<string>()

const chips = ref<string[]>(loadCachedChips('socratic'))
const chipsLoading = ref(false)

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

function loadCachedChips(mode: 'socratic' | 'normal'): string[] {
  const key = mode === 'socratic' ? SK_CHIPS_SOCRATIC : SK_CHIPS_NORMAL
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw)
  } catch (err) {
    console.warn(`建议词缓存 ${key} 解析失败`, err)
  }
  return []
}

function saveCachedChips(mode: 'socratic' | 'normal', list: string[]) {
  const key = mode === 'socratic' ? SK_CHIPS_SOCRATIC : SK_CHIPS_NORMAL
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

function pushMessage(msg: Message) {
  if (!currentSession.value) return
  currentSession.value.messages.push(msg)
  currentSession.value.updatedAt = nowDate()
  if (msg.role === 'user' && currentSession.value.name.startsWith('新')) {
    currentSession.value.name = msg.text.slice(0, 12) + (msg.text.length > 12 ? '…' : '')
  }
  saveSessions()
}

const { findOrCreateTopicSession, rebuildFromBackend } = useDialogueHistory({
  socraticSessions,
  normalSessions,
  topics: () => store.topics,
  createDefaultSession,
  saveSessions,
  parseChoices,
  inferSelectedChoices,
})

const { prepareTopicChoice, handlePendingTopicChoice } = useSessionTopicChoice({
  currentSession,
  topics: () => store.topics,
  pushMessage,
  saveSessions,
  setActiveTopic: store.setActiveTopic,
})

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
  const previous = currentSocraticSession.value?.topicId != null
    ? currentSocraticSession.value
    : socraticSessions.value.find(session => session.topicId != null)
  const session = createDefaultSession(chatMode.value)
  if (chatMode.value === 'socratic') {
    prepareTopicChoice(session, previous)
    socraticSessions.value.unshift(session)
    socraticCurrentId.value = session.id
  } else {
    normalSessions.value.unshift(session)
    normalCurrentId.value = session.id
  }
  pendingTopicName.value = ''
  showHistory.value = false
  saveSessions()
  scrollToBottom()
}

onMounted(() => {
  const cached = loadCachedChips(chatMode.value)
  chips.value = cached.length > 0 ? cached : defaultChips[chatMode.value]

  isHydrated = true
})

watch(() => store.topics.length, (len) => {
  if (len > 0 && store.userInfo?.id) {
    rebuildFromBackend()
  }
}, { immediate: true })

watch(chatMode, () => {

  const cached = loadCachedChips(chatMode.value)
  chips.value = cached.length > 0 ? cached : defaultChips[chatMode.value]
  scrollToBottom()
})

watch([() => store.activeTopicId, chatMode], async ([activeTopicId, mode], previous) => {
  const previousTopicId = previous?.[0]
  if (mode !== 'socratic') {
    if (previousTopicId !== undefined && activeTopicId !== previousTopicId) {
      chatMode.value = 'socratic'
    }
    return
  }
  const numId = Number(activeTopicId)
  if (!numId) return
  const session = findOrCreateTopicSession(numId)
  if (socraticCurrentId.value !== session.id) {
    socraticCurrentId.value = session.id
    showHistory.value = false
    saveSessions()
    scrollToBottom()
  }

  if (store.pendingTopicOverviewId === numId && isHydrated) {
    const title = store.topics.find(t => Number(t.id) === numId)?.title
    store.requestTopicOverview(null)
    if (title) await streamOverview('topic', title)
  }
}, { immediate: true })

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

      mutated = true
      continue
    }
    const t = topics.find(x => Number(x.id) === s.topicId)
    if (t && (s.topicTitle !== t.title || s.name !== t.title.slice(0, 12))) {

      s.topicTitle = t.title
      s.name = t.title.slice(0, 12)
      mutated = true
    }
    next.push(s)
  }

  if (next.length === 0) {
    next.push(createDefaultSession('socratic'))
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

async function deleteSession(id: string) {
  if (deletingSessionIds.has(id)) return
  const sessions = chatMode.value === 'socratic' ? socraticSessions.value : normalSessions.value
  const session = sessions.find(s => s.id === id)
  if (!session) return

  deletingSessionIds.add(id)
  try {
    await deleteChatSession(session.id)
  } catch (err) {
    // 后端未确认删除时保留页面数据，避免出现“看起来删了，刷新又回来”。
    console.error('删除对话失败', err)
    return
  } finally {
    deletingSessionIds.delete(id)
  }

  if (chatMode.value === 'socratic') {
    if (socraticSessions.value.length <= 1) {
      socraticSessions.value[0] = createDefaultSession('socratic')
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
      normalSessions.value[0] = createDefaultSession('normal')
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
    streamControl.abortRequest()
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

function checkStreamingChoices() {
  if (!streamingChoices.value) {
    const { choices } = parseChoices(streamingText.value)
    if (choices) streamingChoices.value = choices
  }
}

function sendChoiceText(choiceText: string) {
  if (isGenerating.value) return
  if (isThinking.value) abortChat()

  const msgs = currentSession.value?.messages
  if (msgs) {
    const matchLabel = choiceText.match(/^([A-F])[.、]/)
    if (matchLabel) {
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'ai' && msgs[i].choices?.length) {
          msgs[i].selected_choice = matchLabel[1]
          break
        }
      }
    }
  }

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

  if (chatMode.value === 'normal') {
    abortController = streamControl.beginRequest()
    isThinking.value = true
    streamingText.value = ''
    const history = messages.value.slice(-10).map(m => ({ role: m.role as 'ai' | 'user', content: m.text }))
    chatStream(
      'normal', 0, currentSession.value!.id, userInput, history, 'normal', '标准',
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

  if (await handlePendingTopicChoice(v)) {
    scrollToBottom()
    return
  }

  if (currentSession.value?.topicId && isNewTopicIntent(v)) {
    pushMessage({ role: 'ai', text: `本对话已绑定「**${currentSession.value.topicTitle}**」主题，每个学习对话只能学习一个主题。\n\n如需学习新主题，请点击右上角「＋」新建对话。`, time: now() })
    scrollToBottom()
    return
  }

  if (pendingTopicName.value) {
    if (isConfirmation(v)) {
      const topicName = pendingTopicName.value
      pendingTopicName.value = ''
      // 清空先前无关对话内容
      messages.value = []
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

  if (currentSession.value?.topicId == null && store.activeNode) {
    const topicId = currentTopicId.value
    const topic = store.topics.find(t => Number(t.id) === topicId)
    if (topicId && topic) {
      currentSession.value.topicId = topicId
      currentSession.value.topicTitle = topic.title
      currentSession.value.name = topic.title.slice(0, 12)
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

  if (currentSession.value?.topicId && !store.nodes.some(n => n.id === store.activeNode!.id)) {
    pushMessage({
      role: 'ai',
      text: `当前对话绑定的是「**${currentSession.value.topicTitle}**」主题，请在该主题的图谱里选一个节点继续。`,
      time: now(),
    })
    scrollToBottom()
    return
  }

  abortController = streamControl.beginRequest()
  isThinking.value = true
  streamingText.value = ''
  scrollToBottom()
  const history = messages.value.slice(-10).map(m => ({ role: m.role as 'ai' | 'user', content: m.text }))
  const userMsgRef = currentSession.value!.messages[currentSession.value!.messages.length - 1]

  chatStream(
    store.activeNode.id, currentTopicId.value, currentSession.value!.id, userInput, history, 'socratic', aiStyle.value,
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

  abortController = streamControl.beginRequest()
  isThinking.value = true
  streamingText.value = ''
  scrollToBottom()

  const history = msgs.slice(0, aiIndex).map(m => ({ role: m.role as 'ai' | 'user', content: m.text })).slice(-10)

  chatStream(
    store.activeNode?.id ?? 'normal', currentTopicId.value, currentSession.value.id, userMsg.text, history, chatMode.value, aiStyle.value,
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
    if (currentSession.value && currentSession.value.topicId == null) {
      currentSession.value.topicId = topic.id
      currentSession.value.topicTitle = topic.title
      currentSession.value.name = topic.title.slice(0, 12)
      saveSessions()
    }
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

function streamOverview(kind: 'topic' | 'node', identifier: string): Promise<void> {
  return new Promise((resolve) => {
    isThinking.value = true
    streamingText.value = ''
    abortController = streamControl.beginRequest()
    const apiKind = kind === 'topic' ? 'topic_overview' : 'node_overview'
    chatStream(
      identifier, currentTopicId.value, currentSession.value!.id, '',
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
      (userMsgId, aiMsgId) => { pendingMsgIds = { user: userMsgId, ai: aiMsgId } },
      apiKind,
    )
  })
}

watch(() => store.activeNode?.id, async (id) => {
  if (!id) return
  if (chatMode.value !== 'socratic') return
  const node = store.activeNode!

  if (node.state === 'mastered') {
    isThinking.value = true
    streamingText.value = ''
    scrollToBottom()

    const prompt = `用户想复习「${node.label}」（${node.sub}），请用苏格拉底式提问引导用户回顾这个知识点的核心内容。`
    abortController = streamControl.beginRequest()
    chatStream(
      node.id, currentTopicId.value, currentSession.value!.id, prompt,
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

  await streamOverview('node', node.id)
})

onBeforeUnmount(() => {
  disposeSessionPersistence()
  streamControl.abortRequest()
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
  position: relative;
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
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--blue), var(--blue-2));
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.thinking-dot {
  position: absolute;
  right: -3px;
  bottom: -3px;
  width: 10px;
  height: 10px;
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
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.dlg-sub {
  font-size: 11px;
  color: var(--ink-3);
  margin-top: 1px;
}
.dlg-actions {
  display: flex;
  gap: 6px;
}
.hdr-btn {
  width: 28px;
  height: 28px;
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--ink-2);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.hdr-btn:hover {
  background: var(--bg-2);
}
</style>
