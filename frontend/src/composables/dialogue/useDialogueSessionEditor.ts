import { nextTick } from 'vue'
import type { DialogueSession as Session } from '../../types'
import { deleteChatSession, uploadChatAvatar, deleteChatAvatar } from '../../api/chat'
import { chatErrorMessage } from './errors'
import type { DialogueState } from './useDialogueState'
import type { useDialogueStreaming } from './useDialogueStreaming'
import type { useDialogueNavigation } from './useDialogueNavigation'

type Context = Pick<
  DialogueState,
  | 'currentSession'
  | 'avatarPickerError'
  | 'avatarPickerSessionId'
  | 'pickerSession'
  | 'avatarPickerBusy'
  | 'saveSessions'
  | 'deletingSession'
  | 'savingSessionName'
  | 'editingSessionId'
  | 'currentSessionId'
  | 'blockDuringAssessment'
  | 'currentSessions'
  | 'pendingSessionDelete'
  | 'chatMode'
  | 'sessionDeleteError'
  | 'historyPanelRef'
  | 'socraticSessions'
  | 'normalSessions'
  | 'attachmentDrafts'
  | 'createDefaultSession'
  | 'socraticCurrentId'
  | 'currentSocraticSession'
  | 'normalCurrentId'
  | 'editingName'
  | 'editingSessionInHeader'
  | 'sessionNameError'
  | 'showHistory'
  | 'sessionNameInputRef'
  | 'sessionNameButtonRef'
  | 'sessionTitles'
> &
  Pick<ReturnType<typeof useDialogueStreaming>, 'rememberRequest'> &
  Pick<ReturnType<typeof useDialogueNavigation>, 'resetSessionInteraction' | 'syncSessionTopic'>

export function useDialogueSessionEditor(context: Context) {
  const {
    currentSession,
    avatarPickerError,
    avatarPickerSessionId,
    pickerSession,
    avatarPickerBusy,
    saveSessions,
    deletingSession,
    savingSessionName,
    editingSessionId,
    currentSessionId,
    blockDuringAssessment,
    currentSessions,
    pendingSessionDelete,
    chatMode,
    sessionDeleteError,
    historyPanelRef,
    socraticSessions,
    normalSessions,
    attachmentDrafts,
    createDefaultSession,
    socraticCurrentId,
    currentSocraticSession,
    normalCurrentId,
    editingName,
    editingSessionInHeader,
    sessionNameError,
    showHistory,
    sessionNameInputRef,
    sessionNameButtonRef,
    sessionTitles,
    rememberRequest,
    resetSessionInteraction,
    syncSessionTopic,
  } = context

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

  function requestSessionDelete(id: string) {
    if (deletingSession.value || savingSessionName.value || editingSessionId.value) return
    if (id === currentSessionId.value && blockDuringAssessment()) return
    const session = currentSessions.value.find((session) => session.id === id)
    if (!session) return
    pendingSessionDelete.value = { id, name: session.name, mode: chatMode.value }
    sessionDeleteError.value = ''
  }

  function cancelSessionDelete() {
    if (deletingSession.value) return
    const id = pendingSessionDelete.value?.id
    pendingSessionDelete.value = null
    sessionDeleteError.value = ''
    if (id) nextTick(() => historyPanelRef.value?.focusAction(id, 'delete'))
  }

  async function confirmSessionDelete() {
    const target = pendingSessionDelete.value
    if (!target || deletingSession.value) return
    const { id, mode } = target
    if (mode === chatMode.value && id === currentSessionId.value && blockDuringAssessment()) return
    const sessions = mode === 'socratic' ? socraticSessions.value : normalSessions.value
    if (!sessions.some((session) => session.id === id)) {
      cancelSessionDelete()
      return
    }

    deletingSession.value = true
    sessionDeleteError.value = ''
    try {
      await deleteChatSession(id)
    } catch (err) {
      // 后端未确认删除时保留页面数据，避免出现“看起来删了，刷新又回来”。
      sessionDeleteError.value = `删除对话失败：${chatErrorMessage(err)}`
      return
    } finally {
      deletingSession.value = false
    }

    const remainingSessions = mode === 'socratic' ? socraticSessions.value : normalSessions.value
    if (!remainingSessions.some((session) => session.id === id)) {
      cancelSessionDelete()
      return
    }
    attachmentDrafts.discardScope(mode, id)
    rememberRequest(id, null)
    if (mode === chatMode.value && id === currentSessionId.value) resetSessionInteraction()

    if (mode === 'socratic') {
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
      if (chatMode.value === 'socratic') syncSessionTopic(currentSocraticSession.value)
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
    cancelSessionDelete()
  }

  function startEdit(session: Session, inHeader = false) {
    if (savingSessionName.value || deletingSession.value || pendingSessionDelete.value) return
    editingSessionId.value = session.id
    editingName.value = session.name
    editingSessionInHeader.value = inHeader
    sessionNameError.value = ''
    if (inHeader) showHistory.value = false
    nextTick(() => {
      sessionNameInputRef.value?.focus()
      sessionNameInputRef.value?.select()
    })
  }

  function cancelSessionNameEdit() {
    if (savingSessionName.value) return
    const restoreHeaderFocus = editingSessionInHeader.value
    const id = editingSessionId.value
    editingSessionId.value = null
    editingSessionInHeader.value = false
    sessionNameError.value = ''
    if (restoreHeaderFocus) nextTick(() => sessionNameButtonRef.value?.focus())
    else if (id) nextTick(() => historyPanelRef.value?.focusAction(id, 'rename'))
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
      sessionNameError.value = '请输入对话名称'
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
      sessionNameError.value = chatErrorMessage(error)
    } finally {
      savingSessionName.value = false
    }
    if (saved && editingSessionId.value === id) cancelSessionNameEdit()
  }

  return {
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
  }
}
