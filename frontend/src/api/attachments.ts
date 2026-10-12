import api from './index'
import type {
  AttachmentCapabilities,
  AttachmentChunk,
  AttachmentScope,
  AttachmentSummary,
} from '../types/attachments'
const root = '/api/attachments'
export async function getAttachmentCapabilities(): Promise<AttachmentCapabilities> {
  return (await api.get(root + '/capabilities')).data
}
export async function uploadAttachment(
  file: File,
  clientId: string,
  scope: AttachmentScope,
  signal: AbortSignal,
  onProgress: (progress: number) => void,
): Promise<AttachmentSummary> {
  const data = new FormData()
  data.append('file', file)
  data.append('client_upload_id', clientId)
  data.append('session_id', scope.session_id)
  data.append('mode', scope.mode)
  if (scope.topic_id) data.append('topic_id', String(scope.topic_id))
  return (
    await api.post(root, data, {
      signal,
      onUploadProgress: ({ loaded, total }) => {
        if (total) onProgress(Math.min(100, Math.round((loaded / total) * 100)))
      },
    })
  ).data
}
export async function getAttachments(ids: string[]): Promise<AttachmentSummary[]> {
  const params = new URLSearchParams()
  ids.forEach((id) => params.append('ids', id))
  return (await api.get(root, { params })).data
}
export async function retryAttachment(id: string): Promise<AttachmentSummary> {
  return (await api.post(`${root}/${encodeURIComponent(id)}/retry`)).data
}
export async function acceptAttachmentCoverage(
  id: string,
  revision: number,
): Promise<AttachmentSummary> {
  return (await api.post(`${root}/${encodeURIComponent(id)}/accept-text-coverage`, { revision }))
    .data
}
export async function deleteAttachment(id: string): Promise<void> {
  await api.delete(`${root}/${encodeURIComponent(id)}`)
}
export async function getAttachmentBlob(
  id: string,
  preview = false,
  signal?: AbortSignal,
): Promise<Blob> {
  return (
    await api.get(`${root}/${encodeURIComponent(id)}/${preview ? 'preview' : 'content'}`, {
      responseType: 'blob',
      signal,
    })
  ).data
}
export async function getAttachmentChunk(
  id: string,
  chunk: string,
  revision: number,
): Promise<AttachmentChunk> {
  return (
    await api.get(`${root}/${encodeURIComponent(id)}/chunks/${encodeURIComponent(chunk)}`, {
      params: { revision },
    })
  ).data
}
export async function downloadAttachment(attachment: Pick<AttachmentSummary, 'id' | 'name'>) {
  const url = URL.createObjectURL(await getAttachmentBlob(attachment.id))
  const link = document.createElement('a')
  link.href = url
  link.download = attachment.name
  link.hidden = true
  document.body.appendChild(link)
  try {
    link.click()
  } finally {
    link.remove()
    // Give the browser time to hand the Blob to its download manager.
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }
}
