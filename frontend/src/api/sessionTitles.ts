import api from './index'
import { getSelectedModelId } from '../utils/modelSelection'
import type { ChatMode, Message } from '../types'

export interface SessionTitleState {
  session_id: string
  title: string | null
  status: 'pending' | 'running' | 'failed' | 'ready' | 'manual'
  retry_pending: boolean
}

export async function getSessionTitles(ids: string[]): Promise<SessionTitleState[]> {
  if (!ids.length) return []
  const batches: Promise<SessionTitleState[]>[] = []
  for (let index = 0; index < ids.length; index += 100) {
    const params = new URLSearchParams()
    for (const id of ids.slice(index, index + 100)) params.append('ids', id)
    batches.push(
      api.get<SessionTitleState[]>('/api/chat/session-titles', { params }).then((res) => res.data),
    )
  }
  return (await Promise.all(batches)).flat()
}

export async function requestSessionTitle(
  sessionId: string,
  mode: ChatMode,
  message: Message,
): Promise<SessionTitleState> {
  return (
    await api.post<SessionTitleState>('/api/chat/session-titles', {
      session_id: sessionId,
      mode,
      message: message.text.slice(0, 4000),
      attachment_names: message.attachments?.map((attachment) => attachment.name) ?? [],
      model: getSelectedModelId(),
    })
  ).data
}

export async function renameSessionTitle(
  sessionId: string,
  title: string,
): Promise<SessionTitleState> {
  return (
    await api.put<SessionTitleState>(`/api/chat/session-titles/${encodeURIComponent(sessionId)}`, {
      title,
    })
  ).data
}
