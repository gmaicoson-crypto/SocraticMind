<template>
  <article
    ref="card"
    class="attachment-card"
    :class="[
      attachment.status,
      {
        'compact-card': compactCard,
        'compact-document': compactDocument,
        'draft-card': Boolean(draft),
        'needs-attention': needsAttention,
      },
    ]"
  >
    <button
      class="file-main"
      type="button"
      :disabled="!attachment.id || attachment.status !== 'ready'"
      @click="open"
    >
      <img v-if="thumbnail" :src="thumbnail" :alt="attachment.name" decoding="async" />
      <span v-else class="file-icon" aria-hidden="true">{{
        attachment.kind === 'image' ? '▧' : '▤'
      }}</span>
      <span class="file-info"
        ><strong :title="attachment.name">{{ attachment.name }}</strong
        ><small
          >{{ sizeLabel }}<template v-if="!compactDocument"> · {{ statusLabel }}</template></small
        ></span
      >
    </button>
    <template v-if="!compactDocument">
      <progress
        v-if="draft?.uploadState === 'uploading'"
        :value="draft.progress"
        max="100"
        :aria-label="`${attachment.name} 上传进度`"
      />
      <template v-if="!draft || needsAttention">
        <p v-if="error || draft?.error || attachment.error_message" role="alert">
          {{ error || draft?.error || attachment.error_message }}
        </p>
        <p v-for="warning in attachment.warnings" :key="warning">{{ warning }}</p>
        <div v-if="attachment.status === 'needs_confirmation'" class="coverage">
          <p>已识别页：{{ attachment.coverage?.recognized_pages.join('、') || '无' }}</p>
          <p>
            未识别页：{{
              attachment.coverage?.missing_pages.join('、') || '无'
            }}。首期不识别扫描页。
          </p>
          <p v-for="(reason, page) in attachment.coverage?.reasons" :key="page">
            第 {{ page }} 页：{{ reason }}
          </p>
          <button v-if="draft" type="button" @click="emit('accept', draft.clientId)">
            仅使用已提取文字
          </button>
        </div>
        <p v-if="attachment.status === 'ready' && attachment.coverage?.missing_pages.length">
          仅使用已确认文字页：{{ attachment.coverage.recognized_pages.join('、') }}
        </p>
      </template>
      <div class="file-actions">
        <button
          v-if="
            draft &&
            (draft.uploadState === 'failed' ||
              (attachment.status === 'failed' && attachment.retryable))
          "
          type="button"
          @click="emit('retry', draft.clientId)"
        >
          重试
        </button>
        <IconButton
          v-if="draft"
          class="remove-file"
          :label="`移除附件：${attachment.name}`"
          title="移除附件"
          @click="emit('remove', draft.clientId)"
        >
          <X :size="14" aria-hidden="true" />
        </IconButton>
        <button v-else-if="attachment.status !== 'deleted'" type="button" @click="download">
          下载
        </button>
      </div>
    </template>
    <AttachmentViewer
      :open="viewerOpen"
      :attachment-id="attachment.id"
      :name="attachment.name"
      :image="attachment.kind === 'image'"
      @close="viewerOpen = false"
    />
  </article>
</template>
<script lang="ts">
// Bound thumbnail requests across all cards, including long history lists.
let activePreviews = 0
const previewQueue: (() => void)[] = []
async function withPreviewSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (activePreviews >= 2) await new Promise<void>((resolve) => previewQueue.push(resolve))
  else activePreviews++
  try {
    return await fn()
  } finally {
    const next = previewQueue.shift()
    if (next) next()
    else activePreviews--
  }
}
</script>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { X } from '@lucide/vue'
import type { AttachmentDraft, AttachmentSummary } from '../../types/attachments'
import { downloadAttachment, getAttachmentBlob } from '../../api/attachments'
import { parseApiError } from '../../api'
import AttachmentViewer from './AttachmentViewer.vue'
import IconButton from '../ui/IconButton.vue'
const props = defineProps<{ attachment: AttachmentSummary; draft?: AttachmentDraft }>()
const compactDocument = computed(() => !props.draft && props.attachment.kind === 'document')
const compactCard = computed(() => Boolean(props.draft) || compactDocument.value)
const emit = defineEmits<{ remove: [id: string]; retry: [id: string]; accept: [id: string] }>()
const card = ref<HTMLElement>()
const privateThumbnail = ref('')
const thumbnail = computed(() => props.draft?.previewUrl || privateThumbnail.value)
const viewerOpen = ref(false)
const error = ref('')
const needsAttention = computed(
  () =>
    Boolean(props.draft) &&
    Boolean(
      error.value ||
      props.draft?.error ||
      props.attachment.error_message ||
      props.draft?.uploadState === 'failed' ||
      ['failed', 'needs_confirmation'].includes(props.attachment.status),
    ),
)
const visible = ref(false)
const sizeLabel = computed(() =>
  props.attachment.size >= 1048576
    ? `${(props.attachment.size / 1048576).toFixed(1)} MiB`
    : `${Math.ceil(props.attachment.size / 1024)} KiB`,
)
const statusLabel = computed(() =>
  props.draft?.uploadState === 'uploading'
    ? `上传 ${props.draft.progress}%`
    : props.draft?.uploadState === 'queued'
      ? '等待上传'
      : props.draft?.uploadState === 'failed'
        ? '上传失败'
        : {
            pending: '排队中',
            processing: '解析中',
            needs_confirmation: '待确认提取范围',
            ready: '可用',
            failed: '处理失败',
            deleted: '资料已删除',
          }[props.attachment.status],
)
let observer: IntersectionObserver | null = null
let controller: AbortController | null = null
watch(
  () => [visible.value, props.attachment.id, props.attachment.status, props.draft?.previewUrl],
  async () => {
    controller?.abort()
    if (privateThumbnail.value) URL.revokeObjectURL(privateThumbnail.value)
    privateThumbnail.value = ''
    if (
      !visible.value ||
      props.draft?.previewUrl ||
      props.attachment.kind !== 'image' ||
      props.attachment.status !== 'ready'
    )
      return
    const request = new AbortController()
    controller = request
    try {
      const blob = await withPreviewSlot(() =>
        getAttachmentBlob(props.attachment.id, true, request.signal),
      )
      if (!request.signal.aborted) privateThumbnail.value = URL.createObjectURL(blob)
    } catch {
      /* Keep the file card usable when thumbnail loading fails. */
    }
  },
  { immediate: true },
)
onMounted(() => {
  if (typeof IntersectionObserver === 'undefined') {
    visible.value = true
    return
  }
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        visible.value = true
        observer?.disconnect()
      }
    },
    { rootMargin: '150px' },
  )
  if (card.value) observer.observe(card.value)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  controller?.abort()
  if (privateThumbnail.value) URL.revokeObjectURL(privateThumbnail.value)
})
function open() {
  if (props.attachment.kind === 'image') viewerOpen.value = true
  else void download()
}
async function download() {
  try {
    await downloadAttachment(props.attachment)
    error.value = ''
  } catch (cause) {
    error.value = parseApiError(cause).message
  }
}
</script>
<style scoped>
.attachment-card {
  min-width: 0;
  flex: 1 1 220px;
  max-width: 100%;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--bg-2);
  font-size: 12px;
  color: var(--ink-2);
}
.compact-card {
  box-sizing: border-box;
  flex: 0 1 280px;
  width: 280px;
  height: 64px;
  display: flex;
  align-items: center;
  padding: 8px 10px;
}
.compact-card .file-main {
  padding: 0;
  font: inherit;
}
.compact-card .file-info {
  flex: 1;
}
.compact-card img,
.compact-card .file-icon {
  width: 32px;
  height: 32px;
}
.compact-card .file-icon {
  font-size: 22px;
}
.draft-card {
  position: relative;
  display: block;
  flex: 0 0 200px;
  width: 200px;
  height: 56px;
  padding: 6px 30px 6px 8px;
}
.draft-card .file-main {
  height: 100%;
  gap: 6px;
}
.draft-card img,
.draft-card .file-icon {
  width: 28px;
  height: 28px;
}
.draft-card .file-icon {
  font-size: 20px;
}
.draft-card strong {
  font-size: 11.5px;
}
.draft-card small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.draft-card progress {
  position: absolute;
  bottom: 4px;
  left: 8px;
  width: calc(100% - 16px);
  height: 3px;
}
.draft-card .file-actions {
  position: absolute;
  top: 6px;
  right: 4px;
  margin-top: 0;
}
.draft-card .file-actions button {
  padding: 2px;
  font-size: 11px;
}
.draft-card.needs-attention {
  height: auto;
  min-height: 56px;
  padding-right: 8px;
}
.draft-card.needs-attention .file-main {
  height: 28px;
}
.draft-card.needs-attention .file-actions {
  position: static;
  margin-top: 4px;
}
.file-main {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  text-align: left;
  color: inherit;
  width: 100%;
  min-width: 0;
  cursor: pointer;
}
.file-main:disabled {
  cursor: default;
}
.file-info {
  display: grid;
  gap: 3px;
  min-width: 0;
}
strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
small {
  color: var(--ink-3);
}
img,
.file-icon {
  width: 38px;
  height: 38px;
  object-fit: cover;
  border-radius: 5px;
  flex-shrink: 0;
}
.file-icon {
  display: grid;
  place-items: center;
  font-size: 26px;
  color: var(--blue);
}
p {
  margin: 6px 0;
  overflow-wrap: anywhere;
}
progress {
  width: 100%;
  height: 5px;
}
.file-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 4px;
}
.file-actions button,
.coverage button {
  border: 0;
  background: transparent;
  color: var(--blue);
  cursor: pointer;
  font: inherit;
  padding: 3px;
}
.file-actions .remove-file {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  color: var(--ink-3);
}
.file-actions .remove-file:hover {
  background: var(--bg-3);
  color: var(--ink);
}
.failed:not(.compact-document) {
  border-color: var(--danger, #c04b4b);
}
</style>
