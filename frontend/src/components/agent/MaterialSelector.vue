<template>
  <details class="material-selector" :open="autoOpen" @toggle="opened">
    <summary>学习资料（{{ modelValue?.length ?? 0 }} / 20）</summary>
    <p>选择已上传的教材，学习流程将使用选定版本。保存后，资料可用于该主题的教学。</p>
    <p v-if="loading" role="status">正在读取资料…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <ul v-if="documents.length">
      <li v-for="document in documents" :key="document.id">
        <label>
          <input
            type="checkbox"
            :checked="selected(document.id)"
            :disabled="busy || (!selected(document.id) && (modelValue?.length ?? 0) >= 20)"
            @change="toggle(document)"
          />
          <span>{{ document.name }} · 版本 {{ document.revision }}</span>
        </label>
        <small
          v-if="
            modelValue?.some(
              (item) => item.attachment_id === document.id && item.revision !== document.revision,
            )
          "
          >所选版本已变化，请取消后重新选择。</small
        >
        <small v-if="document.coverage?.missing_pages?.length"
          >包含未识别页，仅使用已确认的文字范围。</small
        >
        <small v-for="warning in document.warnings" :key="warning">{{ warning }}</small>
        <small>{{ indexStatusLabel(document.index_status) }}</small>
        <button
          v-if="
            ['not_indexed', 'failed', 'cancelled'].includes(document.index_status?.status ?? '')
          "
          type="button"
          :disabled="busy || loading || indexingId !== null"
          @click="indexDocument(document)"
        >
          {{ indexingId === document.id ? '正在排队…' : '建立或重试语义索引' }}
        </button>
      </li>
    </ul>
    <p v-else-if="loaded && !loading && !error">
      暂无可用文档。可先在对话中上传教材并等待解析完成，再刷新资料列表。
    </p>
    <button type="button" :disabled="loading || busy" @click="load(false)">刷新资料</button>
    <button v-if="hasMore" type="button" :disabled="loading || busy" @click="load(true)">
      更多资料
    </button>
    <button
      v-if="modelValue?.length"
      type="button"
      :disabled="busy"
      @click="emit('update:modelValue', [])"
    >
      清空选择
    </button>
  </details>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  getTopicMaterials,
  listKnowledgeDocuments,
  requestMaterialIndex,
} from '../../api/knowledge'
import { parseApiError } from '../../api'
import type { AttachmentSummary } from '../../types/attachments'
import {
  indexStatusLabel,
  type KnowledgeDocumentSummary,
  type MaterialRef,
} from '../../types/knowledge'

const props = defineProps<{
  modelValue?: MaterialRef[]
  topicId?: number
  busy?: boolean
  autoOpen?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: MaterialRef[]] }>()
const documents = ref<KnowledgeDocumentSummary[]>([])
const indexingId = ref<string | null>(null)
let indexController: AbortController | null = null
const loading = ref(false)
const loaded = ref(false)
const error = ref('')
const hasMore = ref(false)
let cursor: string | undefined
let controller: AbortController | null = null
let epoch = 0

function selected(id: string) {
  return props.modelValue?.some((item) => item.attachment_id === id) ?? false
}

function toggle(document: AttachmentSummary) {
  if (props.busy) return
  const remaining = (props.modelValue ?? []).filter((item) => item.attachment_id !== document.id)
  if (!selected(document.id) && remaining.length < 20) {
    remaining.push({ attachment_id: document.id, revision: document.revision })
  }
  emit('update:modelValue', remaining)
}

async function load(more: boolean) {
  if (loading.value) return
  const ownEpoch = epoch
  controller = new AbortController()
  const signal = controller.signal
  loading.value = true
  loaded.value = true
  error.value = ''
  try {
    const [page, bindings] = await Promise.all([
      listKnowledgeDocuments(more ? cursor : undefined, signal),
      !more && props.topicId && props.modelValue === undefined
        ? getTopicMaterials(props.topicId, signal)
        : Promise.resolve(null),
    ])
    if (ownEpoch !== epoch) return
    const combined = more ? [...documents.value, ...page] : [...page]
    if (bindings) {
      combined.push(...bindings.filter((item) => item.available).map((item) => item.document))
      emit(
        'update:modelValue',
        bindings
          .filter((item) => item.available)
          .map((item) => ({
            attachment_id: item.document.id,
            revision: item.revision,
          })),
      )
      if (bindings.some((item) => !item.available)) error.value = '部分主题资料已失效，请重新选择。'
    }
    documents.value = [...new Map(combined.map((item) => [item.id, item])).values()]
    cursor = page.at(-1)?.id
    hasMore.value = page.length === 50
    loaded.value = true
  } catch (cause) {
    if (ownEpoch === epoch && !signal.aborted) error.value = parseApiError(cause).message
  } finally {
    if (ownEpoch === epoch) loading.value = false
  }
}

function opened(event: Event) {
  if ((event.target as HTMLDetailsElement).open && !loaded.value) void load(false)
}

async function indexDocument(document: KnowledgeDocumentSummary) {
  if (props.busy || indexingId.value !== null) return
  const ownEpoch = epoch
  indexController = new AbortController()
  const signal = indexController.signal
  indexingId.value = document.id
  error.value = ''
  try {
    const status = await requestMaterialIndex(
      { attachment_id: document.id, revision: document.revision },
      signal,
    )
    if (ownEpoch !== epoch || signal.aborted) return
    documents.value = documents.value.map((item) =>
      item.id === document.id ? { ...item, index_status: status } : item,
    )
  } catch (cause) {
    if (ownEpoch === epoch && !signal.aborted) error.value = parseApiError(cause).message
  } finally {
    if (ownEpoch === epoch) indexingId.value = null
  }
}

onMounted(() => {
  if (props.autoOpen) void load(false)
})

watch(
  () => props.topicId,
  () => {
    epoch += 1
    controller?.abort()
    indexController?.abort()
    indexingId.value = null
    documents.value = []
    loaded.value = loading.value = hasMore.value = false
    cursor = undefined
  },
)
onBeforeUnmount(() => {
  epoch += 1
  controller?.abort()
  indexController?.abort()
})
</script>

<style scoped>
.material-selector {
  border-top: 1px solid var(--line);
  padding-top: 10px;
  margin: 10px 0;
}
summary {
  cursor: pointer;
  font-weight: 600;
}
p,
small {
  color: var(--ink-muted);
  font-size: 12px;
}
ul {
  list-style: none;
  padding: 0;
  max-height: 240px;
  overflow: auto;
}
li {
  padding: 6px 0;
}
label {
  display: flex;
  align-items: center;
  gap: 8px;
}
small {
  display: block;
  margin: 3px 0 0 24px;
}
button {
  margin: 4px 8px 0 0;
}
</style>
