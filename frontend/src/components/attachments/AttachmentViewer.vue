<template>
  <BaseModal :model-value="open" @close="emit('close')">
    <div class="attachment-overlay" @click.self="emit('close')">
      <section class="attachment-viewer" role="dialog" aria-modal="true" :aria-label="name">
        <header>
          <strong>{{ name }}</strong
          ><button type="button" aria-label="关闭资料预览" @click="emit('close')">×</button>
        </header>
        <p v-if="loading" role="status">正在加载资料…</p>
        <p v-if="error" role="alert">{{ error }}</p>
        <img v-if="imageUrl" :src="imageUrl" :alt="name" />
        <template v-if="summaryText"
          ><h3>分段摘要</h3>
          <p>{{ summaryCoverage }}</p>
          <pre>{{ summaryText }}</pre>
        </template>
        <template v-if="chunk"
          ><h3 v-if="summaryText">原文摘录（本段首块）</h3>
          <p>{{ attachmentLocation(chunk.locator) }}</p>
          <pre>{{ chunk.text }}</pre>
        </template>
        <button type="button" :disabled="loading || deleted" @click="download">下载原文件</button>
      </section>
    </div>
  </BaseModal>
</template>
<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import BaseModal from '../ui/BaseModal.vue'
import { downloadAttachment, getAttachmentBlob, getAttachmentChunk } from '../../api/attachments'
import { parseApiError } from '../../api'
import { attachmentLocation, type AttachmentChunk } from '../../types/attachments'
const props = defineProps<{
  open: boolean
  attachmentId: string
  name: string
  image?: boolean
  chunkId?: string | null
  revision?: number
  deleted?: boolean
  summaryText?: string
  summaryCoverage?: string
}>()
const emit = defineEmits<{ close: [] }>()
const imageUrl = ref('')
const chunk = ref<AttachmentChunk>()
const error = ref('')
const loading = ref(false)
let epoch = 0
let controller: AbortController | null = null
function release() {
  epoch++
  controller?.abort()
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
  imageUrl.value = ''
  chunk.value = undefined
}
watch(
  () => [props.open, props.attachmentId, props.chunkId] as const,
  async ([open]) => {
    release()
    error.value = ''
    if (!open) return
    if (props.deleted) {
      error.value = '资料已删除'
      return
    }
    const current = epoch
    controller = new AbortController()
    loading.value = true
    try {
      if (props.image) {
        const blob = await getAttachmentBlob(props.attachmentId, false, controller.signal)
        if (current === epoch) imageUrl.value = URL.createObjectURL(blob)
      } else if (props.chunkId) {
        const result = await getAttachmentChunk(
          props.attachmentId,
          props.chunkId,
          props.revision ?? 1,
        )
        if (current === epoch) chunk.value = result
      }
    } catch (cause) {
      if (current === epoch)
        error.value =
          parseApiError(cause).status === 404
            ? '资料已删除或不可访问'
            : parseApiError(cause).message
    } finally {
      if (current === epoch) loading.value = false
    }
  },
  { immediate: true },
)
async function download() {
  try {
    await downloadAttachment({ id: props.attachmentId, name: props.name })
  } catch (cause) {
    error.value = parseApiError(cause).message
  }
}
onBeforeUnmount(release)
</script>
<style scoped>
.attachment-overlay {
  position: fixed;
  inset: 0;
  z-index: 500;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--overlay-medium);
}
.attachment-viewer {
  width: min(820px, 100%);
  max-height: 90dvh;
  overflow: auto;
  padding: 20px;
  border-radius: 12px;
  background: var(--surface);
  color: var(--ink);
}
header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  overflow-wrap: anywhere;
}
img {
  display: block;
  max-width: 100%;
  max-height: 65dvh;
  margin: 12px auto;
  object-fit: contain;
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: inherit;
  line-height: 1.7;
}
button {
  padding: 6px 10px;
  border: 1px solid var(--line);
  background: var(--bg-2);
  color: var(--ink);
  border-radius: 6px;
  cursor: pointer;
}
</style>
