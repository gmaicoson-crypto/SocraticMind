import { computed, markRaw, onBeforeUnmount, onMounted, reactive, ref, watch, type Ref } from 'vue'
import {
  acceptAttachmentCoverage,
  deleteAttachment,
  getAttachmentCapabilities,
  getAttachments,
  retryAttachment,
  uploadAttachment,
} from '../api/attachments'
import { parseApiError } from '../api'
import type {
  AttachmentCapabilities,
  AttachmentDraft,
  AttachmentScope,
  AttachmentSummary,
} from '../types/attachments'

const imageExtensions: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
}

// Clipboard screenshots can have a MIME type but no filename extension.
// Preserve existing extensions so unsupported files still reach normal validation.
function normalizeImageFile(file: File): File {
  const extension = imageExtensions[file.type.toLowerCase()]
  if (file.name.includes('.') || !extension) return file
  return new File([file], `${file.name || '粘贴图片'}${extension}`, {
    type: file.type,
    lastModified: file.lastModified,
  })
}

// Each queued upload owns its original scope. A late response cannot enter the next conversation.
export function useAttachmentDrafts(scope: Ref<AttachmentScope>) {
  const scopes = reactive(new Map<string, AttachmentDraft[]>())
  const capabilities = ref<AttachmentCapabilities | null>(null)
  const error = ref('')
  const key = computed(() => `${scope.value.mode}:${scope.value.session_id}`)
  const drafts = computed(() => scopes.get(key.value) ?? [])
  const controllers = new Map<string, AbortController>()
  const queue: { draft: AttachmentDraft; scope: AttachmentScope; key: string }[] = []
  let active = 0
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let polling = false
  const ready = computed(() =>
    drafts.value.every((d) => d.uploadState === 'uploaded' && d.attachment.status === 'ready'),
  )
  function release(d: AttachmentDraft) {
    if (d.previewUrl) URL.revokeObjectURL(d.previewUrl)
    d.previewUrl = undefined
  }
  function thumbnails(items: AttachmentDraft[]) {
    for (const d of items)
      if (d.attachment.kind === 'image' && !d.previewUrl) d.previewUrl = URL.createObjectURL(d.file)
  }
  watch(key, (_, old) => {
    for (const d of scopes.get(old) ?? []) release(d)
    thumbnails(drafts.value)
    error.value = ''
  })
  async function loadCapabilities() {
    try {
      capabilities.value = await getAttachmentCapabilities()
      error.value = ''
    } catch (cause) {
      error.value = parseApiError(cause).message
    }
  }
  onMounted(loadCapabilities)
  function exists(task: (typeof queue)[number]) {
    return !disposed && (scopes.get(task.key) ?? []).some((d) => d.clientId === task.draft.clientId)
  }
  function pump() {
    while (!disposed && active < 2 && queue.length) {
      const task = queue.shift()!
      if (!exists(task)) continue
      const d = task.draft
      const controller = new AbortController()
      controllers.set(d.clientId, controller)
      d.uploadState = 'uploading'
      active++
      void uploadAttachment(d.file, d.clientId, task.scope, controller.signal, (progress) => {
        if (exists(task)) d.progress = progress
      })
        .then((summary) => {
          if (!exists(task)) {
            void deleteAttachment(summary.id).catch(() => {})
            return
          }
          d.attachment = summary
          d.uploadState = 'uploaded'
          d.progress = 100
          schedulePoll()
        })
        .catch((cause) => {
          if (exists(task) && !controller.signal.aborted) {
            d.uploadState = 'failed'
            d.error = parseApiError(cause).message
          }
        })
        .finally(() => {
          controllers.delete(d.clientId)
          active--
          pump()
        })
    }
  }
  function add(files: File[]) {
    const cap = capabilities.value
    if (!cap) {
      error.value = '附件服务尚未就绪，请重试加载。'
      return
    }
    const scopeSnapshot = { ...scope.value }
    const scopeKey = key.value
    if (!scopes.has(scopeKey)) scopes.set(scopeKey, [])
    const list = scopes.get(scopeKey)!
    const failures: string[] = []
    for (const original of files) {
      const file = normalizeImageFile(original)
      const extension = '.' + file.name.split('.').at(-1)?.toLowerCase()
      const image = ['.jpg', '.jpeg', '.png', '.webp'].includes(extension)
      const reason = !cap.allowed_extensions.includes(extension)
        ? '不支持此文件类型'
        : ['.doc', '.ppt'].includes(extension) && !cap.parsers.legacy_office
          ? cap.parsers.legacy_office_error || '旧版 Office 转换服务不可用'
          : !file.size
            ? '文件为空'
            : list.length >= cap.limits.max_attachments
              ? `每条消息最多 ${cap.limits.max_attachments} 个附件`
              : file.size > (image ? cap.limits.max_image_bytes : cap.limits.max_document_bytes)
                ? '文件超过大小限制'
                : list.reduce((sum, d) => sum + d.file.size, file.size) >
                    cap.limits.max_message_bytes
                  ? '附件总大小超过限制'
                  : ''
      if (reason) {
        failures.push(`${file.name}：${reason}`)
        continue
      }
      const clientId = crypto.randomUUID()
      list.push({
        clientId,
        file: markRaw(file),
        uploadState: 'queued',
        progress: 0,
        attachment: {
          id: '',
          name: file.name,
          mime_type: file.type,
          size: file.size,
          kind: image ? 'image' : 'document',
          status: 'pending',
          revision: 0,
          warnings: [],
        },
      })
      const draft = list.at(-1)!
      thumbnails([draft])
      queue.push({ draft, scope: scopeSnapshot, key: scopeKey })
    }
    error.value = failures.join('；')
    pump()
  }
  function schedulePoll() {
    if (!timer && !disposed)
      timer = setTimeout(() => {
        timer = undefined
        void poll()
      }, 1500)
  }
  async function poll() {
    if (disposed || polling) return
    const pending = [...scopes.values()]
      .flat()
      .filter(
        (d) =>
          d.uploadState === 'uploaded' && ['pending', 'processing'].includes(d.attachment.status),
      )
    if (!pending.length) return
    polling = true
    try {
      for (let offset = 0; offset < pending.length; offset += 50) {
        const batch = pending.slice(offset, offset + 50)
        const updates = await getAttachments(batch.map((d) => d.attachment.id))
        for (const d of batch) {
          const found = updates.find((a) => a.id === d.attachment.id)
          if (found) {
            d.attachment = found
            d.error = undefined
          }
        }
      }
    } catch (cause) {
      for (const d of pending) d.error = `状态更新失败，将自动重试：${parseApiError(cause).message}`
    } finally {
      polling = false
      schedulePoll()
    }
  }
  async function remove(clientId: string) {
    const list = drafts.value
    const d = list.find((d) => d.clientId === clientId)
    if (!d) return
    controllers.get(clientId)?.abort()
    if (d.attachment.id) {
      try {
        await deleteAttachment(d.attachment.id)
      } catch (cause) {
        if (parseApiError(cause).status !== 404) {
          d.error = parseApiError(cause).message
          return
        }
      }
    }
    release(d)
    const index = list.indexOf(d)
    if (index >= 0) list.splice(index, 1)
  }
  async function retry(clientId: string) {
    const d = drafts.value.find((d) => d.clientId === clientId)
    if (!d) return
    d.error = undefined
    if (d.attachment.id) {
      try {
        d.attachment = await retryAttachment(d.attachment.id)
        schedulePoll()
      } catch (cause) {
        d.error = parseApiError(cause).message
      }
    } else if (d.uploadState === 'failed') {
      d.uploadState = 'queued'
      queue.push({ draft: d, scope: { ...scope.value }, key: key.value })
      pump()
    }
  }
  async function acceptCoverage(clientId: string) {
    const d = drafts.value.find((d) => d.clientId === clientId)
    if (!d) return
    try {
      d.attachment = await acceptAttachmentCoverage(d.attachment.id, d.attachment.revision)
      d.error = undefined
    } catch (cause) {
      d.error = parseApiError(cause).message
    }
  }
  function snapshot(): AttachmentSummary[] {
    return drafts.value.map((d) => structuredClone(JSON.parse(JSON.stringify(d.attachment))))
  }
  function consume(ids: string[], scopeKey = key.value) {
    const list = scopes.get(scopeKey) ?? []
    scopes.set(
      scopeKey,
      list.filter((d) => {
        if (!ids.includes(d.attachment.id)) return true
        release(d)
        return false
      }),
    )
  }
  function discardScope(mode: AttachmentScope['mode'], sessionId: string) {
    const scopeKey = `${mode}:${sessionId}`
    for (const draft of scopes.get(scopeKey) ?? []) {
      controllers.get(draft.clientId)?.abort()
      release(draft)
      if (draft.attachment.id) void deleteAttachment(draft.attachment.id).catch(() => {})
    }
    scopes.delete(scopeKey)
  }
  onBeforeUnmount(() => {
    disposed = true
    clearTimeout(timer)
    controllers.forEach((c) => c.abort())
    scopes.forEach((list) => list.forEach(release))
  })
  return {
    capabilities,
    error,
    drafts,
    ready,
    key,
    add,
    remove,
    retry,
    acceptCoverage,
    snapshot,
    consume,
    discardScope,
    loadCapabilities,
  }
}
