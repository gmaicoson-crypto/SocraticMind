<template>
  <div class="dialogue-wrap">
    <DialogueHistoryPanel
      ref="historyPanelRef"
      :show="showHistory"
      :chat-mode="chatMode"
      :sessions="currentSessions"
      :fallback-avatar-url="chatMode === 'normal' ? defaultNormalAiAvatar : defaultAiAvatar"
      :current-session-id="currentSessionId"
      @close="showHistory = false"
      @switch="switchSession"
      @new-session="newSession"
      @start-edit="startEdit"
      @delete="requestSessionDelete"
    />

    <DialogueHeader
      ref="sessionNameButtonRef"
      :ai-avatar-url="aiAvatarUrl"
      :is-thinking="isThinking"
      :current-session-title="currentSessionTitle"
      :can-rename-current-session="canRenameCurrentSession"
      :saving-session-name="savingSessionName"
      :current-session-subtitle="currentSessionSubtitle"
      :current-session-node="currentSessionNode"
      :dialogue-status="dialogueStatus"
      :assessment-active="assessmentActive"
      @avatar="openAiAvatarPicker"
      @rename="currentSession && startEdit(currentSession, true)"
      @history="showHistory = !showHistory"
      @new-session="newSession"
    />

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
      <template #edge-control><SidebarExpandButton /></template>
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
          @view-assessment-history="viewAssessmentHistory"
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
    <AssessmentHistoryModal
      v-if="
        chatMode === 'socratic' &&
        assessmentHistoryOpen &&
        store.activeNode?.dbId &&
        !assessmentActive
      "
      :node-id="store.activeNode.dbId"
      :node-label="store.activeNode.label"
      @close="continueLearning"
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
      :model-value="editingSessionId !== null"
      title="编辑对话名称"
      confirm-text="保存名称"
      loading-text="保存中…"
      :loading="savingSessionName"
      @close="cancelSessionNameEdit"
      @update:model-value="(value) => !value && cancelSessionNameEdit()"
      @confirm="editingSessionId && saveSessionName(editingSessionId)"
    >
      <label class="session-name-field ui-name-field">
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
      <p
        v-if="sessionNameError"
        id="session-name-error"
        class="session-name-error ui-name-error"
        role="alert"
      >
        {{ sessionNameError }}
      </p>
    </ConfirmDialog>
    <ConfirmDialog
      :model-value="pendingSessionDelete !== null"
      title="删除对话？"
      confirm-text="确定删除"
      loading-text="删除中…"
      :loading="deletingSession"
      @close="cancelSessionDelete"
      @update:model-value="(value) => !value && cancelSessionDelete()"
      @confirm="confirmSessionDelete"
    >
      <p class="session-delete-message">
        确定删除「{{ pendingSessionDelete?.name }}」及其中的消息吗？此操作无法撤销。
      </p>
      <p v-if="sessionDeleteError" class="session-name-error ui-name-error" role="alert">
        {{ sessionDeleteError }}
      </p>
    </ConfirmDialog>
  </div>
</template>

<script setup lang="ts">
import { useTemplateRef } from 'vue'
import DialogueHistoryPanel from './dialogue/DialogueHistoryPanel.vue'
import SidebarExpandButton from './navigation/SidebarExpandButton.vue'
import MessageList from './dialogue/MessageList.vue'
import AiAvatarPickerModal from './dialogue/AiAvatarPickerModal.vue'
import DialogueInputBar from './dialogue/DialogueInputBar.vue'
import OnboardingForm from './agent/OnboardingForm.vue'
import AgentStepMessage from './agent/AgentStepMessage.vue'
import PlanPreview from './agent/PlanPreview.vue'
import AssessmentResultModal from './agent/AssessmentResultModal.vue'
import AssessmentHistoryModal from './agent/AssessmentHistoryModal.vue'
import NodeMasteryControls from './agent/NodeMasteryControls.vue'
import ConfirmDialog from './ui/ConfirmDialog.vue'
import BaseToast from './ui/BaseToast.vue'
import DialogueHeader from './dialogue/DialogueHeader.vue'
import { defaultAiAvatar, defaultNormalAiAvatar } from '../utils/avatarPresets'
import { useDialogueState } from '../composables/dialogue/useDialogueState'
import { useDialogueAgent } from '../composables/dialogue/useDialogueAgent'
import { useDialogueStreaming } from '../composables/dialogue/useDialogueStreaming'
import { useDialogueSend } from '../composables/dialogue/useDialogueSend'
import { useDialogueNavigation } from '../composables/dialogue/useDialogueNavigation'
import { useDialogueSessionEditor } from '../composables/dialogue/useDialogueSessionEditor'
import { useDialogueMessages } from '../composables/dialogue/useDialogueMessages'
import { useCurrentDialogueSuggestions } from '../composables/dialogue/useCurrentDialogueSuggestions'

const messageListRef = useTemplateRef<InstanceType<typeof MessageList>>('messageListRef')
const inputBarRef = useTemplateRef<InstanceType<typeof DialogueInputBar>>('inputBarRef')
const historyPanelRef = useTemplateRef<InstanceType<typeof DialogueHistoryPanel>>('historyPanelRef')
const sessionNameInputRef = useTemplateRef<HTMLInputElement>('sessionNameInputRef')
const sessionNameButtonRef = useTemplateRef<{ focus: () => void }>('sessionNameButtonRef')
const state = useDialogueState({
  messageListRef,
  inputBarRef,
  historyPanelRef,
  sessionNameInputRef,
  sessionNameButtonRef,
})
const {
  store,
  agentStore,
  activeStreamMessageIds,
  chatError,
  input,
  isThinking,
  isGenerating,
  streamingText,
  streamingWeb,
  streamingChoices,
  quotedText,
  showHistory,
  avatarPickerSessionId,
  avatarPickerBusy,
  avatarPickerError,
  editingSessionId,
  editingName,
  savingSessionName,
  sessionNameError,
  pendingSessionDelete,
  deletingSession,
  sessionDeleteError,
  masteryConfirm,
  assessmentResult,
  assessmentHistoryOpen,
  startingAssessment,
  chatMode,
  aiStyleOptions,
  aiStyle,
  currentSessionId,
  currentSessions,
  currentSession,
  aiAvatarUrl,
  pickerAvatarUrl,
  canRenameCurrentSession,
  activeAgentRun,
  assessmentActive,
  assessmentCanAnswer,
  draftTopic,
  currentSessionNode,
  currentSessionTitle,
  dialogueStatus,
  currentSessionSubtitle,
  attachmentDrafts,
  attachmentDisabledReason,
  attachmentsEnabled,
  socraticBadge,
  normalBadge,
  hideSocraticWelcome,
  placeholder,
  messages,
  replacingMessageIndex,
  retryUserIndex,
  clearQuote,
} = state
const agent = useDialogueAgent(state)
const {
  startLearningPlan,
  cancelOnboardingDraft,
  submitChoiceAnswer,
  updatePlanPreview,
  confirmPlan,
  cancelAgentFlow,
  retryAgentFlow,
  startAssessment,
  continueLearning,
  viewAssessmentHistory,
  requestMasteryAction,
  confirmMasteryAction,
} = agent
const stream = useDialogueStreaming(state)
const { abortChat } = stream
const sender = useDialogueSend({ ...state, ...agent, ...stream })
const { sendChoiceText, sendSuggestion, send, retryAt } = sender
const navigation = useDialogueNavigation({ ...state, ...agent, ...stream, ...sender })
const { switchSession, newSession, changeChatMode } = navigation
const editor = useDialogueSessionEditor({ ...state, ...navigation, ...stream })
const {
  openAiAvatarPicker,
  selectAiAvatar,
  uploadAiAvatar,
  requestSessionDelete,
  cancelSessionDelete,
  confirmSessionDelete,
  startEdit,
  cancelSessionNameEdit,
  saveSessionNameOnEnter,
  saveSessionName,
} = editor
const messageActions = useDialogueMessages(state)
const { quoteMessage, deleteMessage } = messageActions
const suggestions = useCurrentDialogueSuggestions(state)
const { chips, chipsLoading, refreshSuggestions } = suggestions
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
.session-delete-message {
  margin: 0;
  overflow-wrap: anywhere;
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
