<template>
  <div class="dialogue-wrap">
    <DialogueHistoryPanel
      :show="showHistory"
      :chat-mode="chatMode"
      :sessions="currentSessions"
      :fallback-avatar-url="chatMode === 'normal' ? defaultNormalAiAvatar : defaultAiAvatar"
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
        <button
          type="button"
          class="ai-avatar"
          :class="{ thinking: isThinking }"
          title="更改此对话的 AI 头像"
          aria-label="更改此对话的 AI 头像"
          @click="openAiAvatarPicker"
        >
          <img :src="avatarSrc(aiAvatarUrl)" alt="" class="ui-avatar-image ai-avatar-image" />
          <span v-if="isThinking" class="thinking-dot" />
        </button>
        <div>
          <div class="dlg-title">
            {{ currentSessionName }}
          </div>
          <div class="dlg-sub" role="status">
            {{
              isThinking
                ? contextCompacting
                  ? '正在整理较早的对话'
                  : streamingWeb && ['deciding', 'searching'].includes(streamingWeb.status)
                    ? webStatusText[streamingWeb.status]
                    : '正在思考…'
                : '通过提问引导你发现答案'
            }}
          </div>
        </div>
      </div>
      <div class="dlg-actions">
        <button class="hdr-btn" title="对话历史" @click="showHistory = !showHistory">
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <path d="M12 8v4l3 3M3.05 11a9 9 0 1 0 .5-3" />
            <path d="M3 4v4h4" />
          </svg>
        </button>
        <button class="hdr-btn" title="新建对话" @click="newSession">
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <path d="M12 5v14M5 12h14" />
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
      :hide-welcome="hideSocraticWelcome"
      :streaming-text="streamingText"
      :streaming-web="streamingWeb"
      :streaming-choices="streamingChoices"
      :is-thinking="isThinking"
      :avatar-url="store.userInfo?.avatar_url ?? null"
      :ai-avatar-url="aiAvatarUrl"
      @delete="deleteMessage"
      @retry="retryAt"
      @quote="quoteMessage"
      @change-ai-avatar="openAiAvatarPicker"
      @select-choice="sendChoiceText"
    >
      <template #agent>
        <OnboardingForm
          v-if="chatMode === 'socratic' && draftTopic && !activeAgentRun"
          :topic="draftTopic"
          :session-id="currentSessionId"
          :busy="agentStore.submitting"
          :error="agentStore.error?.message"
          :mode="agentStore.topicPlanDraft ? 'existing-topic' : 'new-topic'"
          @submit="startLearningPlan"
          @cancel="cancelOnboardingDraft"
        />
        <AgentStepMessage
          v-else-if="chatMode === 'socratic' && agentStore.run?.step && activeAgentRun"
          :step="agentStore.run.step"
          :kind="agentStore.run.type === 'assessment' ? 'assessment' : 'diagnostic'"
          :busy="agentStore.submitting"
          @answer="submitChoiceAnswer"
          @cancel="cancelAgentFlow"
        />
        <PlanPreview
          v-else-if="
            chatMode === 'socratic' &&
            agentStore.run?.status === 'awaiting_confirmation' &&
            agentStore.preview
          "
          :preview="agentStore.preview"
          :busy="agentStore.submitting"
          @update="updatePlanPreview"
          @confirm="confirmPlan"
          @cancel="cancelAgentFlow"
        />
        <AssessmentResult
          v-else-if="chatMode === 'socratic' && assessmentResult"
          :result="assessmentResult"
          :busy="agentStore.submitting"
          @continue="continueLearning"
          @retry="startAssessment"
          @revert="requestMasteryAction('revert')"
        />
        <div
          v-else-if="chatMode === 'socratic' && agentStore.run?.status === 'failed'"
          class="agent-error"
          :class="{ 'is-retrying': agentStore.retrying }"
          role="status"
          aria-live="polite"
        >
          <strong>{{
            agentStore.retrying ? '流程正在重试…' : (agentStore.error?.message ?? '流程执行失败')
          }}</strong>
          <span v-if="!agentStore.retrying">{{ agentStore.error?.code }}</span>
          <div>
            <button
              v-if="agentStore.canRetry && !agentStore.retrying"
              :disabled="agentStore.submitting"
              @click="retryAgentFlow"
            >
              重试
            </button>
            <button
              v-if="!agentStore.retrying"
              :disabled="agentStore.submitting"
              @click="cancelAgentFlow"
            >
              取消流程
            </button>
          </div>
        </div>
      </template>
    </MessageList>

    <NodeMasteryControls
      v-if="chatMode === 'socratic' && store.activeNode && !draftTopic && !activeAgentRun"
      :node="store.activeNode"
      :busy="agentStore.submitting"
      :error="agentStore.error?.message"
      @assess="startAssessment"
      @self-report="requestMasteryAction('self_report')"
      @revert="requestMasteryAction('revert')"
    />

    <div v-if="chatError" class="chat-error" role="alert">
      <span>{{ chatError }}</span>
      <button v-if="retryRequest && !isThinking" type="button" @click="retryRequest()">重试</button>
    </div>

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
      :is-generating="isGenerating || agentStore.submitting"
      :send-disabled="agentStore.run?.status === 'awaiting_confirmation'"
      :show-chips="!activeAgentRun && !draftTopic"
      :socratic-badge="socraticBadge"
      :normal-badge="normalBadge"
      :placeholder="placeholder"
      @send="send"
      @abort="abortChat"
      @clear-quote="clearQuote"
      @refresh-chips="refreshSuggestions"
      @send-suggestion="sendSuggestion"
    />
    <AiAvatarPickerModal
      v-if="avatarPickerSessionId"
      :mode="chatMode"
      :current-url="pickerAvatarUrl"
      :busy="avatarPickerBusy"
      :error="avatarPickerError"
      @close="avatarPickerSessionId = null"
      @select="selectAiAvatar"
      @upload="uploadAiAvatar"
    />
    <ConfirmDialog
      :model-value="masteryConfirm !== null"
      :title="masteryConfirm === 'revert' ? '撤销掌握状态？' : '确认自报掌握？'"
      :confirm-text="masteryConfirm === 'revert' ? '确认撤销' : '确认掌握'"
      :loading="agentStore.submitting"
      @close="masteryConfirm = null"
      @update:model-value="
        (value) => {
          if (!value) masteryConfirm = null
        }
      "
      @confirm="confirmMasteryAction"
    >
      {{
        masteryConfirm === 'revert'
          ? '撤销后，未满足先修条件的后续节点会由服务端重新锁定，已有学习证据不会删除。'
          : '自报掌握不会生成评估分数。如需可验证结果，请先选择“开始评估”。'
      }}
    </ConfirmDialog>
  </div>
</template>

<script setup lang="ts">
// SocraticDialogue 组件，封装局部界面和交互逻辑。
import { ref, watch, nextTick, computed, onMounted, onBeforeUnmount } from 'vue'
import { useLearningStore } from '../stores/learning'
import { useAgentStore } from '../stores/agent'
import { usePlansStore } from '../stores/plans'
import type { DialogueSession as Session, Message } from '../types'
import type {
  AgentRun,
  AgentRunUpdate,
  AssessmentResult as AssessmentResultData,
  OnboardingInput,
} from '../types/learningAgent'
import {
  chatStream,
  cancelChatStream,
  type ChatKind,
  type ChatQuote,
  getSuggestions,
  deleteMessages,
  deleteChatSession,
  uploadChatAvatar,
  deleteChatAvatar,
} from '../api/chat'
import { updateTopicTitle } from '../api/topic'
import {
  now,
  nowDate,
  genId,
  retryableAiIndex,
  extractTopic,
  isNewTopicIntent,
} from '../utils/chat'
import { getSelectedModelId } from '../utils/modelSelection'
import type { WebSnapshot } from '../types/webSearch'
import { webStatusText } from '../utils/webSearch'
import { webSnapshotForText } from '../utils/messageMarkdown'
import { avatarSrc } from '../utils/avatar'
import { defaultAiAvatar, defaultNormalAiAvatar } from '../utils/avatarPresets'
import { useChatSessions } from '../composables/useChatSessions'
import { useChatStream } from '../composables/useChatStream'
import { useTopicDialogue } from '../composables/useTopicDialogue'
import { useDialogueHistory } from '../composables/useDialogueHistory'
import { useSessionTopicChoice } from '../composables/useSessionTopicChoice'
import { useOnboardingFlow } from '../composables/useOnboardingFlow'
import { useAssessment } from '../composables/useAssessment'

import DialogueHistoryPanel from './dialogue/DialogueHistoryPanel.vue'
import TopicNameBar from './dialogue/TopicNameBar.vue'
import MessageList from './dialogue/MessageList.vue'
import AiAvatarPickerModal from './dialogue/AiAvatarPickerModal.vue'
import DialogueInputBar from './dialogue/DialogueInputBar.vue'
import OnboardingForm from './agent/OnboardingForm.vue'
import AgentStepMessage from './agent/AgentStepMessage.vue'
import PlanPreview from './agent/PlanPreview.vue'
import AssessmentResult from './agent/AssessmentResult.vue'
import NodeMasteryControls from './agent/NodeMasteryControls.vue'
import ConfirmDialog from './ui/ConfirmDialog.vue'

const store = useLearningStore()
const agentStore = useAgentStore()
const plansStore = usePlansStore()
const streamControl = useChatStream()
const { parseChoices, inferSelectedChoices } = useTopicDialogue()
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
let streamEpoch = 0
let activeStreamMessageIds: { user: number; ai: number } | null = null
let activeStreamUserMessage: Message | null = null
let activeStream: StreamContext | null = null
const chatError = ref('')
const retryRequest = ref<(() => void) | null>(null)

const input = ref('')
const isThinking = ref(false)
const contextCompacting = ref(false)
const isGenerating = ref(false)
const streamingText = ref('')
const streamingWeb = ref<WebSnapshot>()
const streamingChoices = ref<{ label: string; text: string }[] | null>(null)
const quotedText = ref('')
const quotedSource = ref<{ dbId?: number; localId?: string } | null>(null)
const showHistory = ref(false)
const avatarPickerSessionId = ref<string | null>(null)
const avatarPickerBusy = ref(false)
const avatarPickerError = ref('')
const editingSessionId = ref<string | null>(null)
const editingName = ref('')
const masteryConfirm = ref<'self_report' | 'revert' | null>(null)
const dismissedAssessmentNodeId = ref<number | null>(null)

let isHydrated = false

const editingTopicName = ref(false)
const editingTopicInput = ref('')

const currentTopicId = computed(() => Number(store.activeTopicId) || 0)
const chatMode = ref<'socratic' | 'normal'>('socratic')
const aiStyleOptions = ['温和', '标准', '严格'] as const
const aiStyle = ref<string>(store.userInfo?.ai_style ?? '标准')

const SK_CHIPS_SOCRATIC = 'sm_chips_socratic'
const SK_CHIPS_NORMAL = 'sm_chips_normal'
const CHIP_POOL_SIZE = 12
const deletingSessionIds = new Set<string>()

const chips = ref<string[]>(loadCachedChips('socratic'))
const chipsLoading = ref(false)

const currentSessionId = computed(() =>
  chatMode.value === 'socratic' ? socraticCurrentId.value : normalCurrentId.value,
)

const currentSessions = computed(() =>
  chatMode.value === 'socratic' ? socraticSessions.value : normalSessions.value,
)

const currentSocraticSession = computed(
  () =>
    socraticSessions.value.find((s) => s.id === socraticCurrentId.value) ??
    socraticSessions.value[0],
)

const currentNormalSession = computed(
  () => normalSessions.value.find((s) => s.id === normalCurrentId.value) ?? normalSessions.value[0],
)

const currentSession = computed(() =>
  chatMode.value === 'socratic' ? currentSocraticSession.value : currentNormalSession.value,
)

const aiAvatarUrl = computed(
  () =>
    currentSession.value?.aiAvatarUrl ??
    (chatMode.value === 'normal' ? defaultNormalAiAvatar : defaultAiAvatar),
)
const pickerSession = computed(() =>
  [...socraticSessions.value, ...normalSessions.value].find(
    (session) => session.id === avatarPickerSessionId.value,
  ),
)
const pickerAvatarUrl = computed(
  () =>
    pickerSession.value?.aiAvatarUrl ??
    (chatMode.value === 'normal' ? defaultNormalAiAvatar : defaultAiAvatar),
)
const currentSessionName = computed(() => currentSession.value?.name ?? '苏格拉底式对话')
const activeAgentRun = computed(() =>
  Boolean(agentStore.run && !['completed', 'cancelled'].includes(agentStore.run.status)),
)
const draftTopic = computed(
  () => agentStore.onboardingTopic ?? agentStore.topicPlanDraft?.title ?? null,
)
const assessmentResult = computed<AssessmentResultData | null>(() => {
  const run = agentStore.run
  if (
    run?.type === 'assessment' &&
    run.status === 'completed' &&
    run.result &&
    'scores' in run.result
  ) {
    const result = run.result as AssessmentResultData
    if (!store.activeNode?.dbId || result.node_id === store.activeNode.dbId) return result
  }
  const node = store.activeNode
  if (!node?.assessmentResult || dismissedAssessmentNodeId.value === node.dbId) return null
  return node.assessmentResult
})
const socraticBadge = computed(() =>
  Math.max(
    0,
    currentSocraticSession.value.messages.filter(
      (message) => !message.messageType || message.messageType === 'chat',
    ).length - 1,
  ),
)
const normalBadge = computed(() => Math.max(0, currentNormalSession.value.messages.length - 1))
const hideSocraticWelcome = computed(
  () =>
    chatMode.value === 'socratic' &&
    (Boolean(draftTopic.value || agentStore.run || currentSession.value?.topicId) ||
      messages.value.some((message) => message.messageType && message.messageType !== 'chat')),
)

const placeholder = computed(() =>
  chatMode.value === 'socratic'
    ? agentStore.run?.step
      ? `${agentStore.run.type === 'assessment' ? '回答评估' : '回答诊断'} ${agentStore.run.step.current}/${agentStore.run.step.total}`
      : '回答问题，或问我一个反问…'
    : '随便问我点什么…',
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
const currentStepInHistory = computed(() => {
  const run = agentStore.run
  if (!run?.step) return false
  return messages.value.some(
    (message) =>
      message.messageType === 'agent_step' &&
      message.metadata?.run_id === run.run_id &&
      message.metadata?.version === run.version,
  )
})

const defaultChips = {
  socratic: [
    '我想学 Python',
    '教我机器学习',
    '讲讲数据结构',
    '学习 Web 开发',
    '解释一下算法',
    '复习编程基础',
    '练习逻辑思维',
    '了解神经网络',
    '帮我制定计划',
    '讲讲数据库',
    '学习前端基础',
    '做一道练习题',
  ],
  normal: [
    '今天天气怎么样',
    '推荐一部电影',
    '给我讲个笑话',
    '聊聊最近的新闻',
    '推荐一本书',
    '分享一个冷知识',
    '有什么旅行建议',
    '聊聊音乐',
    '推荐一道菜',
    '讲个有趣的故事',
    '如何安排周末',
    '聊聊科技趋势',
  ],
}

const alternateChips = {
  socratic: [
    '学习 TypeScript',
    '理解函数概念',
    '讲讲递归',
    '探索操作系统',
    '了解计算机网络',
    '练习概率统计',
    '复习线性代数',
    '讲讲设计模式',
    '学习数据分析',
    '解释排序算法',
    '练习 SQL 查询',
    '了解人工智能',
  ],
  normal: [
    '推荐一首歌',
    '聊聊城市生活',
    '分享生活技巧',
    '推荐一款游戏',
    '有什么运动建议',
    '聊聊历史',
    '讲一个谜语',
    '推荐一部纪录片',
    '如何缓解压力',
    '聊聊摄影',
    '分享一个节日习俗',
    '推荐一个播客',
  ],
}

function loadCachedChips(mode: 'socratic' | 'normal'): string[] {
  const key = mode === 'socratic' ? SK_CHIPS_SOCRATIC : SK_CHIPS_NORMAL
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const cached: unknown = JSON.parse(raw)
      if (
        Array.isArray(cached) &&
        cached.length >= CHIP_POOL_SIZE &&
        cached.every((chip) => typeof chip === 'string')
      ) {
        return cached
      }
    }
  } catch (err) {
    console.warn(`建议词缓存 ${key} 解析失败`, err)
  }
  return []
}

function saveCachedChips(mode: 'socratic' | 'normal', list: string[]) {
  const key = mode === 'socratic' ? SK_CHIPS_SOCRATIC : SK_CHIPS_NORMAL
  localStorage.setItem(key, JSON.stringify(list))
}

function selectSuggestions(candidates: string[], shown: Set<string>): string[] {
  const selected = new Set<string>()
  for (const suggestion of candidates) {
    const text = suggestion.trim()
    if (text && !shown.has(text)) selected.add(text)
    if (selected.size === CHIP_POOL_SIZE) break
  }
  return [...selected]
}

function refreshSuggestions(shown: string[]) {
  void loadSuggestions(true, shown)
}

async function loadSuggestions(force = false, shown: string[] = []) {
  const mode = chatMode.value
  const cached = loadCachedChips(mode)
  if (cached.length > 0 && !force) {
    chips.value = cached
    return
  }
  if (chipsLoading.value) return
  const previous = chips.value
  const visible = new Set(shown)
  chipsLoading.value = true
  try {
    const result = await getSuggestions(mode, shown)
    if (chatMode.value !== mode) return
    const fallback = [...previous, ...defaultChips[mode], ...alternateChips[mode]]
    chips.value = selectSuggestions(
      result.source === 'fallback'
        ? [...fallback, ...result.suggestions]
        : [...result.suggestions, ...fallback],
      visible,
    )
    if (result.source !== 'fallback' && chips.value.length === CHIP_POOL_SIZE) {
      saveCachedChips(mode, chips.value)
    }
  } catch {
    if (chatMode.value === mode) {
      chips.value = selectSuggestions(
        [...previous, ...defaultChips[mode], ...alternateChips[mode]],
        visible,
      )
    }
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

const { findOrCreateTopicSession, inheritTopicAvatar, rebuildFromBackend } = useDialogueHistory({
  socraticSessions,
  normalSessions,
  topics: () => store.topics,
  createDefaultSession,
  saveSessions,
  parseChoices,
  inferSelectedChoices,
})

function inheritCurrentTopicAvatar(session: Session, topicId: number) {
  inheritTopicAvatar(session, topicId, defaultAiAvatar)
}

const { prepareTopicChoice, handlePendingTopicChoice } = useSessionTopicChoice({
  currentSession,
  topics: () => store.topics,
  pushMessage,
  saveSessions,
  setActiveTopic: store.setActiveTopic,
  inheritTopicAvatar: inheritCurrentTopicAvatar,
})

const onboardingFlow = useOnboardingFlow({
  userId: () => store.userInfo?.id,
  sessionId: () => currentSessionId.value,
  onCompleted: handleOnboardingCompleted,
})
const assessmentFlow = useAssessment({
  userId: () => store.userInfo?.id,
  sessionId: () => currentSessionId.value,
})

async function handleOnboardingCompleted(run: AgentRun) {
  const result = run.result as Record<string, unknown> | null
  const topicId = Number(result?.topic_id)
  if (!topicId) return
  const title = run.preview?.topic ?? agentStore.onboardingTopic ?? '学习主题'
  const session = currentSocraticSession.value
  if (session) {
    inheritCurrentTopicAvatar(session, topicId)
    session.topicId = topicId
    session.topicTitle = title
    session.name = title.slice(0, 12)
    session.awaitingTopicChoice = false
    saveSessions()
  }
  agentStore.closeOnboarding()
  await store.fetchTopicsOnly()
  store.requestTopicOverview(topicId)
  await store.setActiveTopic(String(topicId))
  await plansStore.fetchToday(run.preview?.effective_timezone)
}

async function startLearningPlan(input: OnboardingInput) {
  const topicPlanDraft = agentStore.topicPlanDraft
  const response = topicPlanDraft
    ? await onboardingFlow.startTopicPlan(topicPlanDraft.topicId, withoutTopic(input))
    : await onboardingFlow.start(input)
  if (response) {
    agentStore.closeOnboarding()
    agentStore.closeTopicPlan()
  }
  scrollToBottom()
}

function withoutTopic(input: OnboardingInput) {
  const { topic: _topic, ...topicPlanInput } = input
  return topicPlanInput
}

function cancelOnboardingDraft() {
  agentStore.closeOnboarding()
  agentStore.closeTopicPlan()
}

async function submitChoiceAnswer(answer: string) {
  const runId = agentStore.run?.run_id
  const stepId = agentStore.run?.step?.step_id
  recordCurrentAgentStep()
  if (runId && stepId) {
    pushMessage({
      role: 'user',
      text: answer,
      time: now(),
      messageType: 'agent_answer',
      metadata: { run_id: runId, step_id: stepId },
    })
  }
  await (agentStore.run?.type === 'assessment'
    ? assessmentFlow.answer(answer)
    : onboardingFlow.answer(answer))
  scrollToBottom()
}

function recordCurrentAgentStep() {
  const run = agentStore.run
  if (!run?.step || currentStepInHistory.value) return
  pushMessage({
    role: 'ai',
    text: run.step.prompt,
    time: now(),
    messageType: 'agent_step',
    metadata: { run_id: run.run_id, version: run.version, step_id: run.step.step_id },
  })
}

async function updatePlanPreview(input: AgentRunUpdate) {
  await onboardingFlow.update(input)
  scrollToBottom()
}

async function confirmPlan() {
  await onboardingFlow.confirm()
  scrollToBottom()
}

async function cancelAgentFlow() {
  const response = await (agentStore.run?.type === 'assessment'
    ? assessmentFlow.cancel()
    : onboardingFlow.cancel())
  if (response?.status === 'cancelled') {
    agentStore.closeOnboarding()
    agentStore.clearRun()
  }
  scrollToBottom()
}

async function retryAgentFlow() {
  await (agentStore.run?.type === 'assessment' ? assessmentFlow.retry() : onboardingFlow.retry())
  scrollToBottom()
}

async function startAssessment() {
  const nodeId = store.activeNode?.dbId
  if (!nodeId || store.activeNode?.state === 'locked') return
  dismissedAssessmentNodeId.value = null
  await assessmentFlow.start(nodeId)
  scrollToBottom()
}

function continueLearning() {
  dismissedAssessmentNodeId.value = store.activeNode?.dbId ?? null
  agentStore.clearRun()
  scrollToBottom()
}

function requestMasteryAction(action: 'self_report' | 'revert') {
  masteryConfirm.value = action
}

async function confirmMasteryAction() {
  const action = masteryConfirm.value
  const nodeId = store.activeNode?.dbId
  if (!action || !nodeId) return
  const response =
    action === 'revert'
      ? await assessmentFlow.revert(nodeId)
      : await assessmentFlow.selfReport(nodeId)
  if (response) {
    masteryConfirm.value = null
    if (action === 'revert') {
      dismissedAssessmentNodeId.value = nodeId
      agentStore.clearRun()
    }
  }
  scrollToBottom()
}

function scrollToBottom() {
  messageListRef.value?.scrollToBottom()
}

function openAiAvatarPicker() {
  if (!currentSession.value) return
  avatarPickerError.value = ''
  avatarPickerSessionId.value = currentSession.value.id
}

async function selectAiAvatar(url: string) {
  const session = pickerSession.value
  if (!session || avatarPickerBusy.value) return
  avatarPickerBusy.value = true
  avatarPickerError.value = ''
  const previousUrl = session.aiAvatarUrl
  const previousSelected = session.aiAvatarSelected
  let saved = false
  try {
    session.aiAvatarUrl = url
    session.aiAvatarSelected = true
    saveSessions(true)
    saved = true
    avatarPickerSessionId.value = null
  } catch (error: any) {
    session.aiAvatarUrl = previousUrl
    session.aiAvatarSelected = previousSelected
    avatarPickerError.value = error?.response?.data?.detail ?? '更改头像失败'
  } finally {
    avatarPickerBusy.value = false
  }
  if (saved && previousUrl?.startsWith('/static/avatars/')) {
    try {
      await deleteChatAvatar(session.id)
    } catch (error) {
      console.warn('清理旧对话头像失败', error)
    }
  }
}

async function uploadAiAvatar(file: File) {
  const session = pickerSession.value
  if (!session || avatarPickerBusy.value) return
  avatarPickerError.value = ''
  if (file.size > 5 * 1024 * 1024) {
    avatarPickerError.value = '图片大小不能超过 5MB'
    return
  }
  avatarPickerBusy.value = true
  try {
    const url = await uploadChatAvatar(session.id, file)
    if (pickerSession.value?.id === session.id) {
      session.aiAvatarUrl = url
      session.aiAvatarSelected = true
      saveSessions(true)
      avatarPickerSessionId.value = null
    } else {
      await deleteChatAvatar(session.id)
    }
  } catch (error: any) {
    avatarPickerError.value = error?.response?.data?.detail ?? '上传失败，请重试'
  } finally {
    avatarPickerBusy.value = false
  }
}

function switchSession(id: string) {
  if (id === currentSessionId.value) return
  resetSessionInteraction()
  if (chatMode.value === 'socratic') {
    socraticCurrentId.value = id
    syncSessionTopic(currentSocraticSession.value)
  } else normalCurrentId.value = id
  showHistory.value = false
  saveSessions()
  scrollToBottom()
}

function syncSessionTopic(session: Session) {
  if (session.topicId == null) {
    store.clearGraph()
  } else if (store.activeTopicId !== String(session.topicId)) {
    void store.setActiveTopic(String(session.topicId))
  }
}

function newSession() {
  resetSessionInteraction()
  const previous =
    currentSocraticSession.value?.topicId != null
      ? currentSocraticSession.value
      : socraticSessions.value.find((session) => session.topicId != null)
  const session = createDefaultSession(chatMode.value)
  if (chatMode.value === 'socratic') {
    prepareTopicChoice(session, previous)
    socraticSessions.value.unshift(session)
    socraticCurrentId.value = session.id
    syncSessionTopic(session)
  } else {
    normalSessions.value.unshift(session)
    normalCurrentId.value = session.id
  }
  showHistory.value = false
  saveSessions()
  scrollToBottom()
}

function resetSessionInteraction() {
  clearQuote()
  cancelActiveStream()
  chatError.value = ''
  retryRequest.value = null
  streamEpoch += 1
  streamControl.abortRequest()
  activeStreamMessageIds = null
  activeStreamUserMessage = null
  streamingText.value = ''
  streamingWeb.value = undefined
  streamingChoices.value = null
  isThinking.value = false
  agentStore.clearRun()
  agentStore.closeOnboarding()
  agentStore.closeTopicPlan()
}

onMounted(() => {
  const cached = loadCachedChips(chatMode.value)
  chips.value = cached.length > 0 ? cached : defaultChips[chatMode.value]

  syncSessionTopic(currentSocraticSession.value)
  isHydrated = true
})

watch(
  () => store.topics.length,
  (len) => {
    if (len > 0 && store.userInfo?.id) {
      rebuildFromBackend()
    }
  },
  { immediate: true },
)

watch(chatMode, (mode, previousMode) => {
  if (mode !== previousMode) resetSessionInteraction()

  const cached = loadCachedChips(chatMode.value)
  chips.value = cached.length > 0 ? cached : defaultChips[chatMode.value]
  scrollToBottom()
})

watch(
  () => agentStore.onboardingTopic,
  (topic) => {
    if (!topic) return
    chatMode.value = 'socratic'
    if (currentSocraticSession.value?.topicId != null) {
      const session = createDefaultSession('socratic')
      session.awaitingTopicChoice = false
      socraticSessions.value.unshift(session)
      socraticCurrentId.value = session.id
      saveSessions()
    }
    syncSessionTopic(currentSocraticSession.value)
    nextTick(scrollToBottom)
  },
)

watch(
  () => agentStore.topicPlanDraft,
  (draft) => {
    if (!draft) return
    chatMode.value = 'socratic'
    const session = findOrCreateTopicSession(draft.topicId)
    syncSessionTopic(session)
    if (socraticCurrentId.value !== session.id) {
      socraticCurrentId.value = session.id
      showHistory.value = false
      saveSessions()
    }
    nextTick(scrollToBottom)
  },
)

watch(
  () => agentStore.preview,
  (preview) => {
    if (preview && chatMode.value === 'socratic') {
      requestAnimationFrame(scrollToBottom)
    }
  },
  { flush: 'post' },
)

watch(
  [() => store.userInfo?.id, socraticCurrentId],
  async ([userId]) => {
    if (!userId) return
    resetSessionInteraction()
    const restoredAssessment = await assessmentFlow.restore()
    if (!restoredAssessment) await onboardingFlow.restore()
    scrollToBottom()
  },
  { immediate: true },
)

watch(
  [() => store.activeTopicId, chatMode],
  async ([activeTopicId, mode], previous) => {
    const previousTopicId = previous?.[0]
    if (mode !== 'socratic') {
      if (previousTopicId !== undefined && activeTopicId !== previousTopicId) {
        chatMode.value = 'socratic'
      }
      return
    }
    const numId = Number(activeTopicId)
    if (!numId) return
    if (currentSocraticSession.value?.topicId !== numId) {
      const session = findOrCreateTopicSession(numId)
      if (socraticCurrentId.value !== session.id) {
        socraticCurrentId.value = session.id
        showHistory.value = false
        saveSessions()
        scrollToBottom()
      }
    }

    if (store.pendingTopicOverviewId === numId && isHydrated) {
      const title = store.topics.find((t) => Number(t.id) === numId)?.title
      store.requestTopicOverview(null)
      if (title) await streamOverview('topic', title)
    }
  },
  { immediate: true },
)

watch(
  () => store.topics,
  (topics) => {
    const validIds = new Set(topics.map((t) => Number(t.id)))
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
      const t = topics.find((x) => Number(x.id) === s.topicId)
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
      if (!next.find((s) => s.id === socraticCurrentId.value)) {
        socraticCurrentId.value = next[0].id
      }
      saveSessions()
    }
  },
)

async function deleteSession(id: string) {
  if (deletingSessionIds.has(id)) return
  const sessions = chatMode.value === 'socratic' ? socraticSessions.value : normalSessions.value
  const session = sessions.find((s) => s.id === id)
  if (!session) return

  deletingSessionIds.add(id)
  try {
    await deleteChatSession(session.id)
  } catch (err) {
    // 后端未确认删除时保留页面数据，避免出现“看起来删了，刷新又回来”。
    chatError.value = `删除对话失败：${chatErrorMessage(err)}`
    return
  } finally {
    deletingSessionIds.delete(id)
  }

  if (id === currentSessionId.value) resetSessionInteraction()

  if (chatMode.value === 'socratic') {
    if (socraticSessions.value.length <= 1) {
      socraticSessions.value[0] = createDefaultSession('socratic')
      socraticCurrentId.value = socraticSessions.value[0].id
    } else {
      const idx = socraticSessions.value.findIndex((s) => s.id === id)
      socraticSessions.value.splice(idx, 1)
      if (socraticCurrentId.value === id) {
        socraticCurrentId.value = socraticSessions.value[0].id
      }
    }
    syncSessionTopic(currentSocraticSession.value)
  } else {
    if (normalSessions.value.length <= 1) {
      normalSessions.value[0] = createDefaultSession('normal')
      normalCurrentId.value = normalSessions.value[0].id
    } else {
      const idx = normalSessions.value.findIndex((s) => s.id === id)
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
  const session = sessions.find((s) => s.id === id)
  if (session && editingName.value.trim()) {
    session.name = editingName.value.trim()
    saveSessions()
  }
  editingSessionId.value = null
}

function quoteMessage(msg: Message) {
  quotedText.value = msg.text
    .replace(/[#*`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
  if (!msg.db_id && !msg.local_id) {
    msg.local_id = genId()
    saveSessions()
  }
  quotedSource.value = { dbId: msg.db_id, localId: msg.local_id }
  nextTick(() => inputBarRef.value?.focus())
}

function clearQuote() {
  quotedText.value = ''
  quotedSource.value = null
}

function chatErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const value = error as { message?: string; response?: { data?: { detail?: unknown } } }
    const detail = value.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (detail && typeof detail === 'object' && 'message' in detail) return String(detail.message)
    if (value.message) return value.message
  }
  return '请求失败，请重试。'
}

const deletingMessages = new Set<Message>()
async function deleteMessage(index: number) {
  const session = currentSession.value
  const message = session?.messages[index]
  if (!session || !message || deletingMessages.has(message)) return
  if (index === 0 && message.role === 'ai' && message.db_id == null) return
  if (isThinking.value) {
    chatError.value = '请先停止当前回复，再删除消息。'
    return
  }
  deletingMessages.add(message)
  chatError.value = ''
  try {
    const ids = [message.db_id, message.paired_db_id].filter((id): id is number => id != null)
    if (ids.length) await deleteMessages(ids)
    const currentIndex = session.messages.indexOf(message)
    if (currentIndex >= 0) session.messages.splice(currentIndex, 1)
    retryRequest.value = null
    saveSessions()
  } catch (error) {
    chatError.value = `删除失败：${chatErrorMessage(error)}`
  } finally {
    deletingMessages.delete(message)
  }
}

interface StreamContext {
  epoch: number
  sessionId: string
  requestId: string
  controller: AbortController
  replacing: boolean
  retry?: () => void
  onPartial?: (message: Message) => void
  onCancelled?: (ids?: { user: number; ai: number }) => void
  cancelled?: boolean
  web?: WebSnapshot
}

function cancelActiveStream(): Promise<boolean> {
  const stream = activeStream
  activeStream = null
  if (!stream) return Promise.resolve(true)
  return cancelChatStream(stream.sessionId, stream.requestId)
    .then((response) => {
      stream.cancelled = true
      stream.onCancelled?.(response?.msg_ids)
      return true
    })
    .catch((error) => {
      chatError.value = `停止请求未确认：${chatErrorMessage(error)}`
      return false
    })
}

function beginStream(sessionId: string, requestId: string = crypto.randomUUID()): StreamContext {
  cancelActiveStream()
  const controller = streamControl.beginRequest()
  const context = { epoch: ++streamEpoch, sessionId, requestId, controller, replacing: false }
  activeStreamMessageIds = null
  activeStreamUserMessage = null
  activeStream = context
  chatError.value = ''
  contextCompacting.value = false
  retryRequest.value = null
  return context
}

function isCurrentStream(context: StreamContext): boolean {
  return (
    context.epoch === streamEpoch &&
    context.sessionId === currentSession.value?.id &&
    !context.controller.signal.aborted
  )
}

function abortChat() {
  const messageIds = activeStreamMessageIds
  const userMessage = activeStreamUserMessage
  const stoppingStream = activeStream
  const replacing = stoppingStream?.replacing
  const onPartial = stoppingStream?.onPartial
  retryRequest.value = null
  chatError.value = '回复已停止。'
  const cancellation = cancelActiveStream()
  const stoppedEpoch = ++streamEpoch
  void cancellation.then(() => {
    if (streamEpoch === stoppedEpoch && !isThinking.value)
      retryRequest.value = stoppingStream?.retry ?? null
  })
  streamControl.abortRequest()
  activeStreamMessageIds = null
  activeStreamUserMessage = null
  const partial = streamingText.value.trim()
  streamingText.value = ''
  streamingWeb.value = undefined
  streamingChoices.value = null
  isThinking.value = false
  if ((partial || stoppingStream?.web) && !replacing) {
    const { cleanText, choices } = parseChoices(partial)
    if (messageIds && userMessage) userMessage.db_id = messageIds.user
    const partialMessage: Message = {
      role: 'ai',
      text: cleanText,
      time: now(),
      choices: choices ?? undefined,
      db_id: messageIds?.ai,
      metadata: { status: 'interrupted', web: webSnapshotForText(stoppingStream?.web, partial) },
      paired_db_id: userMessage ? undefined : messageIds?.user,
    }
    pushMessage(partialMessage)
    onPartial?.(currentSession.value!.messages.at(-1)!)
  }
  scrollToBottom()
}

interface DialogueRequest {
  nodeKey: string
  topicId: number
  input: string
  mode: 'normal' | 'socratic'
  style: string
  kind?: ChatKind
  quote?: ChatQuote
  userMessage?: Message
  replaceMessage?: Message
  regenerateMessageId?: number
  requestId?: string
  modelId?: string | null
}

function streamDialogue(request: DialogueRequest): Promise<void> {
  const session = currentSession.value
  if (!session) return Promise.resolve()
  const stream = beginStream(session.id, request.requestId)
  const modelId = request.modelId !== undefined ? request.modelId : getSelectedModelId()
  stream.replacing = Boolean(request.replaceMessage)
  activeStreamUserMessage = request.userMessage ?? null
  isThinking.value = true
  streamingText.value = ''
  streamingWeb.value = undefined
  streamingChoices.value = null
  scrollToBottom()
  return new Promise((resolve) => {
    stream.controller.signal.addEventListener('abort', () => resolve(), { once: true })
    let messageIds: { user: number; ai: number } | null = null
    let replaceMessage = request.replaceMessage
    stream.onCancelled = (ids) => {
      if (!ids) return
      messageIds = ids
      if (request.userMessage) request.userMessage.db_id = ids.user
      if (replaceMessage && !request.replaceMessage) {
        replaceMessage.db_id = ids.ai
        replaceMessage.chatRequest = requestContext()
      }
      saveSessions()
    }
    const requestContext = () => ({
      nodeKey: request.nodeKey,
      input: request.input,
      kind: request.kind ?? 'qa',
      userMessageId: messageIds?.user,
    })
    stream.onPartial = (message) => {
      replaceMessage = message
      message.chatRequest = requestContext()
      saveSessions()
    }
    stream.retry = () =>
      void streamDialogue({
        ...request,
        replaceMessage,
        modelId: messageIds || stream.cancelled ? undefined : modelId,
        requestId: messageIds || stream.cancelled ? undefined : stream.requestId,
        regenerateMessageId: messageIds?.ai ?? request.regenerateMessageId,
      })
    const finish = () => {
      activeStream = null
      activeStreamMessageIds = null
      activeStreamUserMessage = null
      streamingText.value = ''
      streamingWeb.value = undefined
      streamingChoices.value = null
      isThinking.value = false
      contextCompacting.value = false
      scrollToBottom()
      resolve()
    }
    const fail = (error: unknown) => {
      if (!isCurrentStream(stream)) return resolve()
      chatError.value = chatErrorMessage(error)
      const partial = streamingText.value.trim()
      if ((partial || stream.web) && !request.replaceMessage) {
        const { cleanText, choices } = parseChoices(partial)
        pushMessage({
          role: 'ai',
          text: cleanText,
          time: now(),
          choices: choices ?? undefined,
          db_id: messageIds?.ai,
          paired_db_id: request.userMessage ? undefined : messageIds?.user,
          chatRequest: requestContext(),
          metadata: { status: 'interrupted', web: webSnapshotForText(stream.web, partial) },
        })
        replaceMessage = session.messages.at(-1)
      }
      // An unknown network outcome reuses its key. A persisted failed answer
      // creates a new generation of the same question instead of submitting it again.
      const failure = error as { retryable?: boolean; code?: string } | null
      if (failure?.code === 'AI_OUTPUT_LIMIT') {
        chatError.value = request.replaceMessage
          ? '本次重新生成达到回复长度上限，已保留原回答。可以继续提问，或缩小问题范围。'
          : '回答达到本次生成长度上限，可输入“继续”接着回答。'
      }
      retryRequest.value =
        failure?.retryable === false && failure.code !== 'CHAT_SESSION_BUSY'
          ? null
          : (stream.retry ?? null)
      finish()
    }
    void chatStream(
      {
        nodeKey: request.nodeKey,
        topicId: request.topicId,
        sessionId: session.id,
        userInput: request.input,
        requestId: stream.requestId,
        mode: request.mode,
        aiStyle: request.style,
        controller: stream.controller,
        kind: request.kind,
        quote: request.quote,
        regenerateMessageId: request.regenerateMessageId,
        modelId: modelId,
      },
      {
        onChunk: (chunk) => {
          if (!isCurrentStream(stream)) return
          contextCompacting.value = false
          streamingText.value += chunk
          checkStreamingChoices()
          scrollToBottom()
        },
        onDone: () => {
          if (!isCurrentStream(stream)) return resolve()
          const content = streamingText.value.trim()
          if (!content) return fail(new Error('模型未返回可用的回答，请重试。'))
          if (content) {
            const { cleanText, choices } = parseChoices(content)
            const message: Message = {
              role: 'ai',
              text: cleanText,
              time: now(),
              choices: choices ?? undefined,
              db_id: messageIds?.ai,
              chatRequest: requestContext(),
              metadata: { web: stream.web },
              paired_db_id: request.userMessage ? undefined : messageIds?.user,
            }
            const replaceIndex = request.replaceMessage
              ? session.messages.indexOf(request.replaceMessage)
              : -1
            if (replaceIndex >= 0) {
              session.messages.splice(replaceIndex, 1, message)
              saveSessions()
            } else pushMessage(message)
          }
          finish()
        },
        onError: fail,
        onMsgIds: (user, ai) => {
          if (!isCurrentStream(stream)) return
          messageIds = { user, ai }
          if (request.userMessage) request.userMessage.db_id = user
          activeStreamMessageIds = messageIds
          saveSessions()
        },
        onWebEvent: (event) => {
          if (
            !isCurrentStream(stream) ||
            event.request_id !== stream.requestId ||
            event.ai_message_id !== messageIds?.ai
          )
            return
          const web =
            event.type === 'web_warning'
              ? {
                  ...event.web,
                  warnings: [
                    ...(event.web.warnings ?? []).filter(
                      (warning) => warning.code !== event.warning.code,
                    ),
                    event.warning,
                  ],
                }
              : event.web
          stream.web = web
          streamingWeb.value = web
          contextCompacting.value = false
        },
        onContextStatus: (status) => {
          if (!isCurrentStream(stream)) return
          contextCompacting.value = status === 'compacting'
        },
      },
    )
  })
}

function buildUserInput(v: string, quote?: string): string {
  return quote ? `> ${quote}\n\n${v}` : v
}

function startTopicEdit() {
  editingTopicInput.value = currentSession.value?.topicTitle ?? ''
  editingTopicName.value = true
}

async function saveTopicName() {
  const newTitle = editingTopicInput.value.trim()
  const topicId = currentSession.value?.topicId
  if (!newTitle || !topicId) {
    editingTopicName.value = false
    return
  }
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

function sendSuggestion(text: string) {
  input.value = text
  void send()
}

async function send() {
  const v = input.value.trim()
  if (
    !v ||
    isThinking.value ||
    isGenerating.value ||
    agentStore.submitting ||
    (chatMode.value === 'socratic' && agentStore.run?.status === 'awaiting_confirmation')
  )
    return

  if (chatMode.value === 'socratic') {
    store.recordLearning()
  }

  if (chatMode.value === 'socratic' && agentStore.run?.step && activeAgentRun.value) {
    const runId = agentStore.run.run_id
    const stepId = agentStore.run.step.step_id
    inputBarRef.value?.reset()
    recordCurrentAgentStep()
    pushMessage({
      role: 'user',
      text: v,
      time: now(),
      messageType: 'agent_answer',
      metadata: { run_id: runId, step_id: stepId },
    })
    input.value = ''
    scrollToBottom()
    await (agentStore.run.type === 'assessment'
      ? assessmentFlow.answer(v)
      : onboardingFlow.answer(v))
    scrollToBottom()
    return
  }

  inputBarRef.value?.reset()
  const quoteSnapshot = quotedText.value
  const sourceSnapshot = quotedSource.value
  const userInput = buildUserInput(v, quoteSnapshot)
  clearQuote()

  pushMessage({
    role: 'user',
    text: v,
    quote: quoteSnapshot || undefined,
    quote_source_db_id: sourceSnapshot?.dbId,
    quote_source_local_id: sourceSnapshot?.localId,
    time: now(),
    messageType: 'chat',
  })
  input.value = ''
  scrollToBottom()

  if (chatMode.value === 'normal') {
    void streamDialogue({
      nodeKey: 'normal',
      topicId: 0,
      input: userInput,
      mode: 'normal',
      style: '标准',
      userMessage: currentSession.value!.messages.at(-1),
      quote: quoteSnapshot ? { text: quoteSnapshot, sourceId: sourceSnapshot?.dbId } : undefined,
    })
    return
  }

  if (await handlePendingTopicChoice(v)) {
    scrollToBottom()
    return
  }

  if (currentSession.value?.topicId && isNewTopicIntent(v)) {
    pushMessage({
      role: 'ai',
      text: `本对话已绑定「**${currentSession.value.topicTitle}**」主题，每个学习对话只能学习一个主题。\n\n如需学习新主题，请点击右上角「＋」新建对话。`,
      time: now(),
    })
    scrollToBottom()
    return
  }

  if (isNewTopicIntent(v)) {
    const topicName = extractTopic(v)
    if (topicName.length >= 2) {
      agentStore.openOnboarding(topicName)
      scrollToBottom()
      return
    }
  }

  if (currentSession.value?.topicId == null && store.activeNode) {
    const topicId = currentTopicId.value
    const topic = store.topics.find((t) => Number(t.id) === topicId)
    if (topicId && topic) {
      inheritCurrentTopicAvatar(currentSession.value, topicId)
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

  if (currentSession.value?.topicId && !store.nodes.some((n) => n.id === store.activeNode!.id)) {
    pushMessage({
      role: 'ai',
      text: `当前对话绑定的是「**${currentSession.value.topicTitle}**」主题，请在该主题的图谱里选一个节点继续。`,
      time: now(),
    })
    scrollToBottom()
    return
  }

  void streamDialogue({
    nodeKey: store.activeNode.id,
    topicId: currentTopicId.value,
    input: userInput,
    mode: 'socratic',
    style: aiStyle.value,
    userMessage: currentSession.value!.messages.at(-1),
    quote: quoteSnapshot ? { text: quoteSnapshot, sourceId: sourceSnapshot?.dbId } : undefined,
  })
}

async function retryAt(aiIndex: number) {
  if (isThinking.value) return
  const messages = currentSession.value?.messages ?? []
  if (aiIndex !== retryableAiIndex(messages)) return
  const original = messages[aiIndex]
  if (original.db_id == null) {
    chatError.value = '这条回复尚未保存，无法重新生成。'
    return
  }
  const request = original.chatRequest
  const userMessage = request?.userMessageId
    ? messages.find((message) => message.db_id === request.userMessageId)
    : messages
        .slice(0, aiIndex)
        .reverse()
        .find((message) => message.role === 'user')
  if (!userMessage && !request) return
  await streamDialogue({
    nodeKey:
      request?.nodeKey ?? (chatMode.value === 'normal' ? 'normal' : (store.activeNode?.id ?? '')),
    topicId: chatMode.value === 'normal' ? 0 : currentTopicId.value,
    input: request?.input ?? buildUserInput(userMessage!.text, userMessage!.quote),
    kind: request?.kind,
    mode: chatMode.value,
    style: aiStyle.value,
    userMessage,
    replaceMessage: original,
    regenerateMessageId: original.db_id,
    quote: userMessage?.quote
      ? { text: userMessage.quote, sourceId: userMessage.quote_source_db_id }
      : undefined,
  })
}

function streamOverview(kind: 'topic' | 'node', identifier: string): Promise<void> {
  return streamDialogue({
    nodeKey: identifier,
    topicId: currentTopicId.value,
    input: '',
    mode: 'socratic',
    style: aiStyle.value,
    kind: kind === 'topic' ? 'topic_overview' : 'node_overview',
  })
}

watch(
  () => store.nodeDialogueRequest,
  async () => {
    const node = store.activeNode
    if (!node) return
    if (chatMode.value !== 'socratic') {
      chatMode.value = 'socratic'
      await nextTick()
    }

    if (node.state === 'mastered') {
      await streamDialogue({
        nodeKey: node.id,
        topicId: currentTopicId.value,
        input: `用户想复习「${node.label}」（${node.sub}），请用苏格拉底式提问引导用户回顾这个知识点的核心内容。`,
        mode: 'socratic',
        style: aiStyle.value,
      })
      return
    }

    await streamOverview('node', node.id)
  },
)

onBeforeUnmount(() => {
  disposeSessionPersistence()
  cancelActiveStream()
  streamEpoch += 1
  streamControl.abortRequest()
})
</script>

<style scoped>
.chat-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  color: var(--color-danger, #b42318);
  font-size: 13px;
}
.chat-error button {
  flex-shrink: 0;
  padding: 4px 10px;
  border: 1px solid currentColor;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

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
  container-type: inline-size;
}

.dlg-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--header-gradient);
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
  background: var(--ai-avatar-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: visible;
  border: 0;
  padding: 0;
  cursor: pointer;
}
.ai-avatar:focus-visible {
  outline: 2px solid var(--blue-2);
  outline-offset: 2px;
}
.ai-avatar-image {
  border-radius: inherit;
}
.thinking-dot {
  position: absolute;
  right: -3px;
  bottom: -3px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--green);
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
.agent-error {
  display: grid;
  width: min(100%, 680px);
  align-self: center;
  gap: 7px;
  padding: 14px 16px;
  border: 1px solid var(--danger-line);
  border-radius: 8px;
  background: var(--danger-soft);
  color: var(--ink);
  font-size: 12px;
}
.agent-error.is-retrying {
  border-color: var(--line);
  background: var(--surface);
}
.agent-error > span {
  color: var(--ink-3);
  font-family: var(--font-mono);
  overflow-wrap: anywhere;
}
.agent-error > div {
  display: flex;
  gap: 8px;
}
.agent-error button {
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
  color: var(--ink-2);
  cursor: pointer;
}
</style>
