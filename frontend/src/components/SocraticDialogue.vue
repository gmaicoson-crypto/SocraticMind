<template>
  <div class="dialogue-wrap">
    <DialogueHistoryPanel
      :show="showHistory"
      :chat-mode="chatMode"
      :sessions="currentSessions"
      :fallback-avatar-url="chatMode === 'normal' ? defaultNormalAiAvatar : defaultAiAvatar"
      :current-session-id="currentSessionId"
      :editing-session-id="editingSessionInHeader ? null : editingSessionId"
      :editing-name="editingName"
      @close="showHistory = false"
      @switch="switchSession"
      @new-session="newSession"
      @start-edit="startEdit"
      @cancel-edit="cancelSessionNameEdit"
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
        <div class="dlg-heading">
          <div class="dlg-title-row">
            <div class="dlg-title" :title="currentSessionTitle">
              {{ currentSessionTitle }}
            </div>
            <button
              ref="sessionNameButtonRef"
              type="button"
              class="session-name-edit"
              :title="canRenameCurrentSession ? '编辑对话名称' : '发送消息后可编辑对话名称'"
              aria-label="编辑对话名称"
              :disabled="!canRenameCurrentSession || savingSessionName"
              @click="currentSession && startEdit(currentSession, true)"
            >
              <Pencil :size="13" aria-hidden="true" />
            </button>
          </div>
          <div
            class="dlg-sub"
            :title="currentSessionSubtitle"
            :role="currentSessionNode ? undefined : 'status'"
          >
            {{ currentSessionSubtitle }}
          </div>
          <div v-if="isThinking && currentSessionNode" class="dlg-status" role="status">
            {{ dialogueStatus }}
          </div>
        </div>
      </div>
      <div class="dlg-actions">
        <button
          class="hdr-btn"
          title="对话历史"
          :disabled="assessmentActive"
          @click="showHistory = !showHistory"
        >
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
        <button class="hdr-btn" title="新建对话" :disabled="assessmentActive" @click="newSession">
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

    <MessageList
      ref="messageListRef"
      :messages="messages"
      :hide-welcome="hideSocraticWelcome"
      :streaming-text="streamingText"
      :streaming-message-id="activeStreamMessageIds?.ai"
      :replacing-message-index="replacingMessageIndex"
      :streaming-web="streamingWeb"
      :streaming-choices="streamingChoices"
      :is-thinking="isThinking"
      :retry-user-index="retryUserIndex"
      :chat-disabled="assessmentActive"
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
          v-else-if="
            chatMode === 'socratic' && agentStore.run?.step && activeAgentRun && !assessmentActive
          "
          :step="agentStore.run.step"
          kind="diagnostic"
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
        <div
          v-else-if="
            chatMode === 'socratic' && agentStore.run?.status === 'failed' && !assessmentActive
          "
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
      <template #overlay>
        <div v-if="assessmentActive" class="assessment-overlay">
          <AgentStepMessage
            v-if="assessmentCanAnswer && agentStore.run?.step"
            :step="agentStore.run.step"
            kind="assessment"
            :busy="agentStore.submitting"
            :error="agentStore.error?.message"
            @answer="submitChoiceAnswer"
            @cancel="cancelAgentFlow"
          />
          <div
            v-else
            class="agent-error"
            :class="{ 'is-retrying': startingAssessment || agentStore.retrying }"
            role="status"
            aria-live="polite"
          >
            <strong>{{
              startingAssessment
                ? '评估中，请稍候…'
                : (agentStore.error?.message ?? '评估尚未完成，请重试或放弃评估。')
            }}</strong>
            <div>
              <button
                v-if="agentStore.canRetry"
                :disabled="agentStore.submitting"
                @click="retryAgentFlow"
              >
                重试
              </button>
              <button :disabled="agentStore.submitting" @click="cancelAgentFlow">放弃评估</button>
            </div>
          </div>
        </div>
        <NodeMasteryControls
          v-else-if="chatMode === 'socratic' && store.activeNode && !draftTopic && !activeAgentRun"
          :node="store.activeNode"
          :busy="agentStore.submitting"
          :error="agentStore.error?.message"
          @assess="startAssessment"
          @self-report="requestMasteryAction('self_report')"
          @revert="requestMasteryAction('revert')"
        />
      </template>
    </MessageList>

    <BaseToast v-model:message="chatError" />

    <DialogueInputBar
      ref="inputBarRef"
      v-model:input="input"
      :chat-mode="chatMode"
      :mode-switch-disabled="assessmentActive"
      @update:chat-mode="changeChatMode"
      v-model:ai-style="aiStyle"
      :ai-style-options="aiStyleOptions"
      :chips="chips"
      :chips-loading="chipsLoading"
      :quoted-text="quotedText"
      :is-thinking="isThinking"
      :is-generating="isGenerating || agentStore.submitting"
      :send-disabled="
        agentStore.run?.status === 'awaiting_confirmation' ||
        (assessmentActive && !assessmentCanAnswer)
      "
      :send-label="assessmentActive ? '提交答案' : '发送'"
      :attachments="attachmentDrafts.drafts.value"
      :attachments-ready="attachmentDrafts.ready.value"
      :attachments-disabled="!attachmentsEnabled"
      :attachment-disabled-reason="attachmentDisabledReason"
      :attachment-accept="attachmentDrafts.capabilities.value?.allowed_extensions.join(',') ?? ''"
      :attachment-error="attachmentDrafts.error.value"
      @add-attachments="attachmentDrafts.add"
      @remove-attachment="attachmentDrafts.remove"
      @retry-attachment="attachmentDrafts.retry"
      @accept-coverage="attachmentDrafts.acceptCoverage"
      @reload-attachment-service="attachmentDrafts.loadCapabilities"
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
    <AssessmentResultModal
      v-if="chatMode === 'socratic' && assessmentResult && !assessmentActive"
      :result="assessmentResult"
      :busy="agentStore.submitting"
      :close-disabled="masteryConfirm !== null"
      @continue="continueLearning"
      @retry="startAssessment"
      @revert="requestMasteryAction('revert')"
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
    <ConfirmDialog
      :model-value="editingSessionInHeader && editingSessionId !== null"
      title="编辑对话名称"
      confirm-text="保存名称"
      loading-text="保存中…"
      :loading="savingSessionName"
      @close="cancelSessionNameEdit"
      @update:model-value="(value) => !value && cancelSessionNameEdit()"
      @confirm="editingSessionId && saveSessionName(editingSessionId)"
    >
      <label class="session-name-field">
        <span>对话名称</span>
        <input
          ref="sessionNameInputRef"
          v-model="editingName"
          type="text"
          maxlength="40"
          :disabled="savingSessionName"
          :aria-invalid="Boolean(sessionNameError)"
          :aria-describedby="sessionNameError ? 'session-name-error' : undefined"
          @input="sessionNameError = ''"
          @keydown.enter="saveSessionNameOnEnter"
        />
      </label>
      <p v-if="sessionNameError" id="session-name-error" class="session-name-error" role="alert">
        {{ sessionNameError }}
      </p>
    </ConfirmDialog>
  </div>
</template>

<script setup lang="ts">
// SocraticDialogue 组件，封装局部界面和交互逻辑。
import { ref, watch, nextTick, computed, onMounted, onBeforeUnmount } from 'vue'
import { Pencil } from '@lucide/vue'
import { useAttachmentDrafts } from '../composables/useAttachmentDrafts'
import { useModelsStore } from '../stores/models'
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
  getChatRequestState,
  type ChatKind,
  type ChatQuote,
  deleteMessages,
  deleteChatSession,
  uploadChatAvatar,
  deleteChatAvatar,
} from '../api/chat'
import {
  now,
  nowDate,
  genId,
  retryableAiIndex,
  replyUserIndex,
  hasMessageContent,
  countCompletedChatTurns,
  extractTopic,
  isNewTopicIntent,
  sessionNodeKey,
} from '../utils/chat'
import { getSelectedModelId } from '../utils/modelSelection'
import type { WebSnapshot } from '../types/webSearch'
import { messageWeb } from '../utils/webSearch'
import { webSnapshotForText } from '../utils/messageMarkdown'
import { avatarSrc } from '../utils/avatar'
import { defaultAiAvatar, defaultNormalAiAvatar } from '../utils/avatarPresets'
import { useChatSessions } from '../composables/useChatSessions'
import { useSessionTitles } from '../composables/useSessionTitles'
import { useChatStream } from '../composables/useChatStream'
import { useTopicDialogue } from '../composables/useTopicDialogue'
import { useDialogueSuggestions } from '../composables/useDialogueSuggestions'
import { useDialogueHistory } from '../composables/useDialogueHistory'
import { useSessionTopicChoice } from '../composables/useSessionTopicChoice'
import { useOnboardingFlow } from '../composables/useOnboardingFlow'
import { useAssessment } from '../composables/useAssessment'

import DialogueHistoryPanel from './dialogue/DialogueHistoryPanel.vue'
import MessageList from './dialogue/MessageList.vue'
import AiAvatarPickerModal from './dialogue/AiAvatarPickerModal.vue'
import DialogueInputBar from './dialogue/DialogueInputBar.vue'
import OnboardingForm from './agent/OnboardingForm.vue'
import AgentStepMessage from './agent/AgentStepMessage.vue'
import PlanPreview from './agent/PlanPreview.vue'
import AssessmentResultModal from './agent/AssessmentResultModal.vue'
import NodeMasteryControls from './agent/NodeMasteryControls.vue'
import ConfirmDialog from './ui/ConfirmDialog.vue'
import BaseToast from './ui/BaseToast.vue'

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
const sessionTitles = useSessionTitles({
  sessions: () => [...socraticSessions.value, ...normalSessions.value],
  mode: (session) =>
    socraticSessions.value.some((item) => item.id === session.id) ? 'socratic' : 'normal',
  userId: () => store.userInfo?.id,
})

const messageListRef = ref<InstanceType<typeof MessageList> | null>(null)
const inputBarRef = ref<InstanceType<typeof DialogueInputBar> | null>(null)
let streamEpoch = 0
const activeStreamMessageIds = ref<{ user: number; ai: number } | null>(null)
const activeReplacementMessage = ref<Message | null>(null)
let activeStreamUserMessage: Message | null = null
let activeStream: StreamContext | null = null
const chatError = ref('')
const retryRequest = ref<(() => void) | null>(null)
const retryUserMessage = ref<Message | null>(null)

const input = ref('')
const isThinking = ref(false)
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
const editingSessionInHeader = ref(false)
const savingSessionName = ref(false)
const sessionNameError = ref('')
const sessionNameInputRef = ref<HTMLInputElement | null>(null)
const sessionNameButtonRef = ref<HTMLButtonElement | null>(null)
const masteryConfirm = ref<'self_report' | 'revert' | null>(null)
const dismissedAssessmentNodeId = ref<number | null>(null)
const startingAssessment = ref(false)

let isHydrated = false

const currentTopicId = computed(() => Number(store.activeTopicId) || 0)
const chatMode = ref<'socratic' | 'normal'>('socratic')
const aiStyleOptions = ['温和', '标准', '严格'] as const
const aiStyle = ref<string>(store.userInfo?.ai_style ?? '标准')

const deletingSessionIds = new Set<string>()

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
const currentSessionName = computed(() => currentSession.value?.name ?? '新对话')
const canRenameCurrentSession = computed(
  () =>
    !currentSession.value?.awaitingTopicChoice &&
    currentSession.value?.messages.some((message) => message.role === 'user'),
)
const activeAgentRun = computed(() =>
  Boolean(agentStore.run && !['completed', 'cancelled'].includes(agentStore.run.status)),
)
const assessmentActive = computed(
  () => startingAssessment.value || (agentStore.run?.type === 'assessment' && activeAgentRun.value),
)
const assessmentCanAnswer = computed(
  () => agentStore.run?.status === 'assessing' && Boolean(agentStore.run.step),
)
watch(assessmentActive, (active) => {
  if (active) {
    showHistory.value = false
    clearQuote()
  }
})
const draftTopic = computed(
  () => agentStore.onboardingTopic ?? agentStore.topicPlanDraft?.title ?? null,
)
const currentSessionNode = computed(() => {
  if (
    chatMode.value !== 'socratic' ||
    draftTopic.value ||
    activeAgentRun.value ||
    currentSession.value?.topicId !== currentTopicId.value
  )
    return undefined
  const nodeKey = sessionNodeKey(currentSession.value)
  return store.nodes.find((node) => node.id === nodeKey)
})
const currentSessionTitle = computed(
  () => currentSessionNode.value?.label ?? currentSessionName.value,
)
const dialogueStatus = computed(() => (isThinking.value ? '正在思考…' : '通过提问引导你发现答案'))
const currentSessionSubtitle = computed(() =>
  currentSessionNode.value ? currentSessionName.value : dialogueStatus.value,
)

watch(
  [() => sessionNodeKey(currentSocraticSession.value), () => store.nodes, socraticCurrentId],
  ([nodeKey, nodes]) => {
    const session = currentSocraticSession.value
    if (session?.topicId !== currentTopicId.value) return
    const node = nodes.find((item) => item.id === nodeKey)
    if (node) store.setActiveNode(node)
    else if (session.nodeKey === null) store.setActiveNode(null)
  },
  { immediate: true },
)
const modelsStore = useModelsStore()
const attachmentDrafts = useAttachmentDrafts(
  computed(() => ({
    session_id: currentSessionId.value,
    mode: chatMode.value,
    topic_id:
      chatMode.value === 'socratic'
        ? (currentSession.value?.topicId ?? currentTopicId.value)
        : undefined,
  })),
)
const attachmentDisabledReason = computed(() => {
  if (chatMode.value === 'normal') return ''
  if (activeAgentRun.value || draftTopic.value)
    return '诊断、测评和计划确认阶段不能添加附件，已有草稿会保留'
  if (currentSession.value?.awaitingTopicChoice) return '请先完成主题选择，已有附件草稿会保留'
  if (!store.activeNode || !currentSession.value?.topicId) return '请先选择已有主题的学习节点'
  if (
    Number(store.activeTopicId) !== currentSession.value.topicId ||
    !store.nodes.some((n) => n.id === store.activeNode?.id)
  )
    return '请在本对话主题中选择有效节点'
  return ''
})
const attachmentsEnabled = computed(() => !attachmentDisabledReason.value)
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
const replacingMessageIndex = computed(() =>
  activeReplacementMessage.value ? messages.value.indexOf(activeReplacementMessage.value) : -1,
)
const retryUserIndex = computed(() => {
  if (!retryUserMessage.value) return undefined
  if (!retryRequest.value) return -1
  const user = retryUserMessage.value
  return messages.value.findIndex(
    (message) =>
      message === user ||
      (message.role === 'user' && user.db_id != null && message.db_id === user.db_id),
  )
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

const { chips, chipsLoading, refreshSuggestions } = useDialogueSuggestions(
  () => {
    const session = currentSession.value
    const topicId = chatMode.value === 'socratic' ? session?.topicId : undefined
    const hasConversation =
      chatMode.value === 'normal' &&
      Boolean(
        session?.messages.some(
          (message) =>
            (!message.messageType || message.messageType === 'chat') &&
            hasMessageContent(message) &&
            (message.role === 'user' || message.db_id != null || message.chatRequest),
        ),
      )
    const node =
      topicId &&
      currentTopicId.value === topicId &&
      store.nodes.some((item) => item.id === store.activeNode?.id)
        ? store.activeNode
        : null
    return {
      mode: chatMode.value,
      userId: store.userInfo?.id,
      modelId: modelsStore.selectedModelId,
      ...(topicId || hasConversation
        ? {
            sessionId: session?.id,
            completedTurns: countCompletedChatTurns(session?.messages ?? []),
          }
        : {}),
      ...(chatMode.value === 'normal' ? { hasConversation } : {}),
      ...(topicId
        ? {
            topicId,
            topicTitle:
              store.topics.find((topic) => Number(topic.id) === topicId)?.title ??
              session?.topicTitle,
            nodeKey: node?.id,
            nodeLabel: node?.label,
            nodeSub: node?.sub,
          }
        : {}),
    }
  },
  () => !isThinking.value && !isGenerating.value && !activeAgentRun.value && !draftTopic.value,
)

function pushMessage(msg: Message) {
  if (!currentSession.value) return
  currentSession.value.messages.push(msg)
  currentSession.value.updatedAt = nowDate()
  if (msg.role === 'user') void sessionTitles.ensureTitle(currentSession.value)
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
  resetScrollToBottom()
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
  if (agentStore.submitting || (assessmentActive.value && !assessmentCanAnswer.value)) return
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
  resetScrollToBottom()
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
  resetScrollToBottom()
  await onboardingFlow.update(input)
  scrollToBottom()
}

async function confirmPlan() {
  resetScrollToBottom()
  await onboardingFlow.confirm()
  scrollToBottom()
}

async function cancelAgentFlow() {
  resetScrollToBottom()
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
  resetScrollToBottom()
  await (agentStore.run?.type === 'assessment' ? assessmentFlow.retry() : onboardingFlow.retry())
  scrollToBottom()
}

async function startAssessment() {
  if (assessmentActive.value || agentStore.submitting || isThinking.value) return
  const nodeId = store.activeNode?.dbId
  if (!nodeId || store.activeNode?.state === 'locked') return
  dismissedAssessmentNodeId.value = null
  startingAssessment.value = true
  resetScrollToBottom()
  try {
    await assessmentFlow.start(nodeId)
  } finally {
    startingAssessment.value = false
  }
  scrollToBottom()
}

function continueLearning() {
  if (blockDuringAssessment()) return
  dismissedAssessmentNodeId.value = store.activeNode?.dbId ?? null
  agentStore.clearRun()
  resetScrollToBottom()
}

function requestMasteryAction(action: 'self_report' | 'revert') {
  if (blockDuringAssessment()) return
  masteryConfirm.value = action
}

async function confirmMasteryAction() {
  if (blockDuringAssessment()) return
  const action = masteryConfirm.value
  const nodeId = store.activeNode?.dbId
  if (!action || !nodeId) return
  resetScrollToBottom()
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

function resetScrollToBottom() {
  messageListRef.value?.scrollToBottom(true)
}

watch(currentSessionId, resetScrollToBottom)

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
  if (blockDuringAssessment()) return
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
  if (blockDuringAssessment()) return
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
  editingSessionId.value = null
  editingSessionInHeader.value = false
  sessionNameError.value = ''
  activeReplacementMessage.value = null
  clearQuote()
  cancelActiveStream()
  chatError.value = ''
  retryRequest.value = null
  retryUserMessage.value = null
  streamEpoch += 1
  streamControl.abortRequest()
  activeStreamMessageIds.value = null
  activeStreamUserMessage = null
  streamingText.value = ''
  streamingWeb.value = undefined
  streamingChoices.value = null
  isThinking.value = false
  agentStore.clearRun()
  agentStore.closeOnboarding()
  agentStore.closeTopicPlan()
}

function persistBeforePageHide() {
  saveSessions(true)
}

onMounted(() => {
  saveSessions(true)
  window.addEventListener('pagehide', persistBeforePageHide)
  syncSessionTopic(currentSocraticSession.value)
  isHydrated = true
})

watch(
  () => [store.topics.length, store.userInfo?.id] as const,
  ([, userId]) => {
    if (userId) {
      void rebuildFromBackend().then(() => sessionTitles.refreshTitles())
    }
  },
  { immediate: true },
)

function blockDuringAssessment() {
  if (!assessmentActive.value) return false
  chatError.value = '请先完成评估或点击“放弃评估”，再继续对话。'
  return true
}

function changeChatMode(mode: 'socratic' | 'normal') {
  if (mode === chatMode.value || blockDuringAssessment()) return
  chatMode.value = mode
}

watch(chatMode, (mode, previousMode) => {
  if (mode !== previousMode) resetSessionInteraction()

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
    resetScrollToBottom()
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
    resetScrollToBottom()
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
    if (assessmentActive.value) {
      const topicId = currentSocraticSession.value?.topicId
      if (topicId && activeTopicId !== String(topicId)) {
        blockDuringAssessment()
        await store.setActiveTopic(String(topicId))
      }
      store.requestTopicOverview(null)
      return
    }
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
      if (t && s.topicTitle !== t.title) {
        s.topicTitle = t.title
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
  if (id === currentSessionId.value && blockDuringAssessment()) return
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

  attachmentDrafts.discardScope(chatMode.value, id)
  rememberRequest(id, null)
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

function startEdit(session: Session, inHeader = false) {
  if (savingSessionName.value) return
  editingSessionId.value = session.id
  editingName.value = session.name
  editingSessionInHeader.value = inHeader
  sessionNameError.value = ''
  if (inHeader) {
    showHistory.value = false
    nextTick(() => {
      sessionNameInputRef.value?.focus()
      sessionNameInputRef.value?.select()
    })
  }
}

function cancelSessionNameEdit() {
  if (savingSessionName.value) return
  const restoreHeaderFocus = editingSessionInHeader.value
  editingSessionId.value = null
  editingSessionInHeader.value = false
  sessionNameError.value = ''
  if (restoreHeaderFocus) nextTick(() => sessionNameButtonRef.value?.focus())
}

function saveSessionNameOnEnter(event: KeyboardEvent) {
  if (event.isComposing) return
  event.preventDefault()
  if (editingSessionId.value) void saveSessionName(editingSessionId.value)
}

async function saveSessionName(id: string) {
  if (savingSessionName.value || editingSessionId.value !== id) return
  const name = editingName.value.trim()
  const session = [...socraticSessions.value, ...normalSessions.value].find((s) => s.id === id)
  if (!session) return
  if (!name) {
    if (editingSessionInHeader.value) sessionNameError.value = '请输入对话名称'
    else chatError.value = '请输入对话名称'
    return
  }
  savingSessionName.value = true
  sessionNameError.value = ''
  let saved = false
  try {
    await sessionTitles.renameTitle(session, name)
    saved = true
  } catch (error) {
    if (editingSessionId.value !== id) return
    const message = chatErrorMessage(error)
    if (editingSessionInHeader.value) sessionNameError.value = message
    else chatError.value = message
  } finally {
    savingSessionName.value = false
  }
  if (saved && editingSessionId.value === id) cancelSessionNameEdit()
}

function quoteMessage(msg: Message) {
  if (blockDuringAssessment()) return
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
    const deletedAttachmentIds = new Set(
      message.attachments?.map((attachment) => attachment.id) ?? [],
    )
    if (deletedAttachmentIds.size) {
      for (const item of session.messages) {
        const web = item.metadata?.web as WebSnapshot | undefined
        if (web)
          item.metadata = {
            ...item.metadata,
            web: {
              ...web,
              sources: web.sources.map((source) =>
                'attachment_id' in source && deletedAttachmentIds.has(source.attachment_id)
                  ? { ...source, deleted: true, excerpt: '' }
                  : source,
              ),
            },
          }
      }
    }
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
  userMessage?: Message
  onRecovered?: (ids: { user: number; ai: number }) => void
  onPartial?: (message: Message) => void
  onCancelled?: (ids?: { user: number; ai: number }) => void
  cancelled?: boolean
  web?: WebSnapshot
}

const pendingRequestKey = 'sm_pending_chat_requests'
let recoveryTimer: ReturnType<typeof setTimeout> | undefined
function pendingRequests(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(pendingRequestKey) ?? '{}')
  } catch {
    return {}
  }
}
function rememberRequest(sessionId: string, requestId: string | null) {
  const pending = pendingRequests()
  if (requestId) pending[sessionId] = requestId
  else delete pending[sessionId]
  localStorage.setItem(pendingRequestKey, JSON.stringify(pending))
}
async function recoverRequest(
  sessionId: string,
  requestId: string,
  epoch: number,
  failedStream?: StreamContext,
) {
  if (streamEpoch !== epoch || currentSession.value?.id !== sessionId) return
  try {
    const state = await getChatRequestState(requestId)
    if (streamEpoch !== epoch || currentSession.value?.id !== sessionId) return
    if (state.session_id && state.session_id !== sessionId) return
    if (state.msg_ids) failedStream?.onRecovered?.(state.msg_ids)
    const localUser = currentSession.value?.messages.find(
      (message) => message.role === 'user' && message.metadata?.pending_request_id === requestId,
    )
    if (localUser && state.msg_ids) {
      localUser.db_id = state.msg_ids.user
      attachmentDrafts.consume(
        localUser.attachments?.map((attachment) => attachment.id) ?? [],
        `${chatMode.value}:${sessionId}`,
      )
      saveSessions()
    }
    if (state.status === 'generating') {
      isThinking.value = true
      retryRequest.value = null
      if (!activeStream)
        activeStream = {
          epoch,
          sessionId,
          requestId,
          controller: new AbortController(),
          replacing: false,
          retry: failedStream?.retry,
          userMessage: failedStream?.userMessage,
          onPartial: failedStream?.onPartial,
          onCancelled: (ids) => {
            if (!failedStream) return
            failedStream.cancelled = true
            failedStream.onCancelled?.(ids)
          },
        }
      activeStreamMessageIds.value = state.msg_ids ?? null
      const partialReply = currentSession.value?.messages.find(
        (message) =>
          message.role === 'ai' && message.db_id != null && message.db_id === state.msg_ids?.ai,
      )
      activeStream.replacing = Boolean(partialReply)
      streamingText.value = partialReply?.text ?? ''
      streamingChoices.value = partialReply?.choices ?? null
      streamingWeb.value = messageWeb(partialReply?.metadata)
      recoveryTimer = setTimeout(
        () => void recoverRequest(sessionId, requestId, epoch, failedStream),
        2000,
      )
      return
    }
    rememberRequest(sessionId, null)
    activeStream = null
    activeStreamMessageIds.value = null
    activeStreamUserMessage = null
    streamingText.value = ''
    streamingWeb.value = undefined
    streamingChoices.value = null
    isThinking.value = false
    if (state.status !== 'complete') {
      chatError.value = state.error?.message || '此前回复已中断，可从消息重新生成。'
      retryRequest.value = state.error?.retryable === false ? null : (failedStream?.retry ?? null)
      retryUserMessage.value = failedStream?.userMessage ?? null
    } else {
      chatError.value = ''
      retryRequest.value = null
      retryUserMessage.value = null
    }
    await rebuildFromBackend()
    await sessionTitles.refreshTitles()
  } catch (cause) {
    if (streamEpoch !== epoch) return
    const status = (cause as { response?: { status?: number } }).response?.status
    if (status === 404) {
      rememberRequest(sessionId, null)
      activeStream = null
      activeStreamMessageIds.value = null
      activeStreamUserMessage = null
      streamingText.value = ''
      streamingWeb.value = undefined
      streamingChoices.value = null
      isThinking.value = false
      chatError.value = '请求未被服务端接收，请重试。'
      retryRequest.value = failedStream?.retry ?? null
      retryUserMessage.value = failedStream?.userMessage ?? null
      return
    }
    chatError.value = '暂时无法确认回复状态，将自动重试。'
    recoveryTimer = setTimeout(
      () => void recoverRequest(sessionId, requestId, epoch, failedStream),
      5000,
    )
  }
}
watch(
  currentSessionId,
  (sessionId) => {
    clearTimeout(recoveryTimer)
    const requestId = pendingRequests()[sessionId]
    if (requestId) {
      const epoch = streamEpoch
      void nextTick(() => recoverRequest(sessionId, requestId, epoch))
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => clearTimeout(recoveryTimer))

function cancelActiveStream(): Promise<boolean> {
  const stream = activeStream
  activeStream = null
  if (!stream) return Promise.resolve(true)
  return cancelChatStream(stream.sessionId, stream.requestId)
    .then((response) => {
      stream.cancelled = true
      rememberRequest(stream.sessionId, null)
      stream.onCancelled?.(response?.msg_ids)
      return true
    })
    .catch((error) => {
      chatError.value = `停止请求未确认：${chatErrorMessage(error)}`
      return false
    })
}

function beginStream(sessionId: string, requestId: string = crypto.randomUUID()): StreamContext {
  activeReplacementMessage.value = null
  cancelActiveStream()
  const controller = streamControl.beginRequest()
  const context = { epoch: ++streamEpoch, sessionId, requestId, controller, replacing: false }
  activeStreamMessageIds.value = null
  activeStreamUserMessage = null
  activeStream = context
  chatError.value = ''
  retryRequest.value = null
  retryUserMessage.value = null
  return context
}

function isCurrentStream(context: StreamContext): boolean {
  return (
    activeStream === context &&
    context.epoch === streamEpoch &&
    context.sessionId === currentSession.value?.id &&
    !context.controller.signal.aborted
  )
}

function abortChat() {
  const messageIds = activeStreamMessageIds.value
  const userMessage = activeStreamUserMessage
  const stoppingStream = activeStream
  const replacing = stoppingStream?.replacing
  const onPartial = stoppingStream?.onPartial
  retryRequest.value = null
  chatError.value = '回复已停止。'
  const cancellation = cancelActiveStream()
  const stoppedEpoch = ++streamEpoch
  void cancellation.then(() => {
    if (streamEpoch === stoppedEpoch && !isThinking.value) {
      retryRequest.value = stoppingStream?.retry ?? null
      retryUserMessage.value = stoppingStream?.userMessage ?? null
    }
  })
  streamControl.abortRequest()
  activeStreamMessageIds.value = null
  activeStreamUserMessage = null
  const partial = streamingText.value.trim()
  streamingText.value = ''
  streamingWeb.value = undefined
  streamingChoices.value = null
  isThinking.value = false
  const { cleanText, choices } = parseChoices(partial)
  if (hasMessageContent({ text: cleanText, choices: choices ?? undefined }) && !replacing) {
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
  attachmentIds?: string[]
  attachmentScopeKey?: string
}

function streamDialogue(request: DialogueRequest): Promise<void> {
  if (blockDuringAssessment()) return Promise.resolve()
  const session = currentSession.value
  if (!session) return Promise.resolve()
  // Freeze ids before dispatch; retry closures never read the current input draft.
  request = { ...request, attachmentIds: [...(request.attachmentIds ?? [])] }
  if (request.mode === 'socratic' && !request.regenerateMessageId && !request.replaceMessage) {
    session.nodeKey = request.kind === 'topic_overview' ? null : request.nodeKey
    saveSessions()
  }
  const stream = beginStream(session.id, request.requestId)
  clearTimeout(recoveryTimer)
  rememberRequest(session.id, stream.requestId)
  if (request.userMessage) {
    request.userMessage.metadata = {
      ...request.userMessage.metadata,
      pending_request_id: stream.requestId,
    }
    saveSessions()
  }
  const modelId = request.modelId !== undefined ? request.modelId : getSelectedModelId()
  stream.replacing = Boolean(request.replaceMessage)
  activeReplacementMessage.value = request.replaceMessage ?? null
  stream.userMessage = request.userMessage
  activeStreamUserMessage = request.userMessage ?? null
  isThinking.value = true
  streamingText.value = ''
  streamingWeb.value = undefined
  streamingChoices.value = null
  resetScrollToBottom()
  return new Promise((resolve) => {
    stream.controller.signal.addEventListener('abort', () => resolve(), { once: true })
    let messageIds: { user: number; ai: number } | null = null
    let replaceMessage = request.replaceMessage
    stream.onRecovered = stream.onCancelled = (ids) => {
      if (!ids) return
      messageIds = ids
      if (request.userMessage) request.userMessage.db_id = ids.user
      attachmentDrafts.consume(request.attachmentIds ?? [], request.attachmentScopeKey)
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
      attachmentIds: request.attachmentIds,
    })
    stream.onPartial = (message) => {
      replaceMessage = message
      message.chatRequest = requestContext()
      saveSessions()
    }
    stream.retry = () => {
      const current = currentSession.value
      if (!current || current.id !== session.id || isThinking.value) return
      // Recovery can replace local message objects with persisted history.
      const userMessage =
        current.messages.find(
          (message) =>
            message.role === 'user' &&
            message.db_id === request.userMessage?.db_id &&
            message.db_id != null,
        ) ?? request.userMessage
      const aiMessageId = messageIds?.ai
      const persistedReply =
        aiMessageId != null
          ? current.messages.find(
              (message) => message.role === 'ai' && message.db_id === aiMessageId,
            )
          : undefined
      const replacement =
        persistedReply ??
        current.messages.find(
          (message) =>
            message.role === 'ai' &&
            message.db_id === replaceMessage?.db_id &&
            message.db_id != null,
        ) ??
        replaceMessage
      void streamDialogue({
        ...request,
        userMessage,
        replaceMessage: replacement,
        modelId: messageIds || stream.cancelled ? undefined : modelId,
        requestId: messageIds || stream.cancelled ? undefined : stream.requestId,
        regenerateMessageId: messageIds?.ai ?? request.regenerateMessageId,
      })
    }
    const finish = () => {
      activeStream = null
      activeStreamMessageIds.value = null
      activeStreamUserMessage = null
      streamingText.value = ''
      streamingWeb.value = undefined
      streamingChoices.value = null
      isThinking.value = false
      scrollToBottom()
      resolve()
    }
    const fail = (error: unknown) => {
      if (!isCurrentStream(stream)) return resolve()
      chatError.value = chatErrorMessage(error)
      const partial = streamingText.value.trim()
      const { cleanText, choices } = parseChoices(partial)
      if (
        hasMessageContent({ text: cleanText, choices: choices ?? undefined }) &&
        !request.replaceMessage
      ) {
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
      retryUserMessage.value = request.userMessage ?? null
      const transportFailure =
        error instanceof TypeError ||
        [
          'CHAT_STREAM_DISCONNECTED',
          'CHAT_STREAM_TIMEOUT',
          'CHAT_STREAM_EMPTY',
          'CHAT_REQUEST_RUNNING',
        ].includes(failure?.code ?? '')
      if (!transportFailure) rememberRequest(session.id, null)
      finish()
      if (transportFailure) {
        void recoverRequest(
          session.id,
          stream.requestId,
          stream.epoch,
          retryRequest.value ? stream : undefined,
        )
      }
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
        attachmentIds: request.attachmentIds,
      },
      {
        onChunk: (chunk) => {
          if (!isCurrentStream(stream)) return
          streamingText.value += chunk
          checkStreamingChoices()
          scrollToBottom()
        },
        onDone: () => {
          if (!isCurrentStream(stream)) return resolve()
          rememberRequest(session.id, null)
          const content = streamingText.value.trim()
          const { cleanText, choices } = parseChoices(content)
          if (!hasMessageContent({ text: cleanText, choices: choices ?? undefined }))
            return fail(new Error('模型未返回可用的回答，请重试。'))
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
          finish()
        },
        onError: fail,
        onMsgIds: (user, ai) => {
          if (!isCurrentStream(stream)) return
          messageIds = { user, ai }
          if (request.userMessage) request.userMessage.db_id = user
          activeStreamMessageIds.value = messageIds
          attachmentDrafts.consume(request.attachmentIds ?? [], request.attachmentScopeKey)
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
        },
      },
    )
  })
}

function buildUserInput(v: string, quote?: string): string {
  return quote ? `> ${quote}\n\n${v}` : v
}

function checkStreamingChoices() {
  if (!streamingChoices.value) {
    const { choices } = parseChoices(streamingText.value)
    if (choices) streamingChoices.value = choices
  }
}

function sendChoiceText(choiceText: string) {
  if (blockDuringAssessment()) return
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
  if (blockDuringAssessment()) return
  input.value = text
  void send({
    topicFollowUp: chatMode.value === 'socratic' && Boolean(currentSession.value?.topicId),
  })
}

async function send(options?: { topicFollowUp?: boolean }) {
  if (assessmentActive.value && !assessmentCanAnswer.value) {
    blockDuringAssessment()
    return
  }
  const v = input.value.trim()
  const newTopicIntent = !options?.topicFollowUp && isNewTopicIntent(v)
  if (
    (!v && (!attachmentsEnabled.value || !attachmentDrafts.drafts.value.length)) ||
    isThinking.value ||
    isGenerating.value ||
    agentStore.submitting ||
    (chatMode.value === 'socratic' && agentStore.run?.status === 'awaiting_confirmation')
  )
    return

  if (
    attachmentsEnabled.value &&
    attachmentDrafts.drafts.value.length &&
    !attachmentDrafts.ready.value
  ) {
    chatError.value = attachmentDisabledReason.value || '请先等待所有附件处理完成，或移除失败附件。'
    return
  }
  if (
    attachmentsEnabled.value &&
    attachmentDrafts.drafts.value.length &&
    chatMode.value === 'socratic' &&
    newTopicIntent
  ) {
    chatError.value = '附件仅用于当前节点问答。新主题创建暂不支持附件，草稿已保留。'
    return
  }

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
    resetScrollToBottom()
    await (agentStore.run.type === 'assessment'
      ? assessmentFlow.answer(v)
      : onboardingFlow.answer(v))
    scrollToBottom()
    return
  }

  inputBarRef.value?.reset()
  const attachmentsSnapshot = attachmentsEnabled.value ? attachmentDrafts.snapshot() : []
  const attachmentIds = attachmentsSnapshot.map((attachment) => attachment.id)
  const attachmentScopeKey = attachmentDrafts.key.value
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
    attachments: attachmentsSnapshot,
  })
  input.value = ''
  resetScrollToBottom()

  if (chatMode.value === 'normal') {
    void streamDialogue({
      nodeKey: 'normal',
      topicId: 0,
      input: userInput,
      mode: 'normal',
      style: '标准',
      attachmentIds,
      attachmentScopeKey,
      userMessage: currentSession.value!.messages.at(-1),
      quote: quoteSnapshot ? { text: quoteSnapshot, sourceId: sourceSnapshot?.dbId } : undefined,
    })
    return
  }

  if (currentSession.value?.awaitingTopicChoice) {
    const handled = await handlePendingTopicChoice(v)
    if (currentSession.value) void sessionTitles.ensureTitle(currentSession.value)
    if (handled) {
      scrollToBottom()
      return
    }
  }

  if (currentSession.value?.topicId && newTopicIntent) {
    pushMessage({
      role: 'ai',
      text: `本对话已绑定「**${currentSession.value.topicTitle}**」主题，每个学习对话只能学习一个主题。\n\n如需学习新主题，请点击右上角「＋」新建对话。`,
      time: now(),
    })
    scrollToBottom()
    return
  }

  if (newTopicIntent) {
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
    attachmentIds,
    attachmentScopeKey,
    userMessage: currentSession.value!.messages.at(-1),
    quote: quoteSnapshot ? { text: quoteSnapshot, sourceId: sourceSnapshot?.dbId } : undefined,
  })
}

async function retryAt(messageIndex: number) {
  if (blockDuringAssessment()) return
  if (isThinking.value) return
  if (messageIndex === retryUserIndex.value && retryRequest.value) {
    retryRequest.value()
    return
  }
  const messages = currentSession.value?.messages ?? []
  const aiIndex = retryableAiIndex(messages)
  if (aiIndex < 0) return
  const userIndex = replyUserIndex(messages, aiIndex)
  if (messageIndex !== aiIndex && messageIndex !== userIndex) return
  const original = messages[aiIndex]
  if (original.db_id == null) {
    chatError.value = '这条回复尚未保存，无法重新生成。'
    return
  }
  const request = original.chatRequest
  const userMessage = messages[userIndex]
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
    attachmentIds:
      request?.attachmentIds ?? userMessage?.attachments?.map((attachment) => attachment.id),
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
    if (blockDuringAssessment()) return
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
  window.removeEventListener('pagehide', persistBeforePageHide)
  disposeSessionPersistence()
  cancelActiveStream()
  streamEpoch += 1
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
  min-width: 0;
}
.dlg-heading {
  min-width: 0;
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
.dlg-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.dlg-title {
  min-width: 0;
  font-weight: 600;
  font-size: 13.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}
.session-name-edit {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ink-3);
  cursor: pointer;
}
.session-name-edit:hover:not(:disabled) {
  background: var(--bg-2);
  color: var(--ink);
}
.session-name-edit:focus-visible {
  outline: 2px solid var(--blue-2);
  outline-offset: 2px;
}
.session-name-edit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.session-name-field {
  display: grid;
  gap: 8px;
}
.session-name-field input {
  width: 100%;
  min-width: 0;
  padding: 9px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg-2);
  color: var(--ink);
  font: inherit;
}
.session-name-field input:focus {
  border-color: var(--blue-2);
  outline: 2px solid var(--focus-ring);
}
.session-name-field input[aria-invalid='true'] {
  border-color: var(--danger-ink);
}
.session-name-error {
  margin: 8px 0 0;
  color: var(--danger-ink);
  font-size: 12px;
}

.dlg-sub,
.dlg-status {
  font-size: 11px;
  color: var(--ink-3);
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dlg-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
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
.hdr-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.assessment-overlay {
  display: flex;
  justify-content: center;
  padding: 8px 14px 10px;
  pointer-events: none;
}
.assessment-overlay > :deep(.step-tool),
.assessment-overlay > .agent-error {
  max-height: min(360px, 45vh);
  overflow-y: auto;
  box-shadow: var(--control-shadow);
  pointer-events: auto;
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
