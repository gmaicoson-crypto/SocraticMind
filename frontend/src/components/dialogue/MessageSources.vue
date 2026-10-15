<template>
  <div
    v-if="
      !pending &&
      web &&
      (web.status !== 'off' || web.sources.length) &&
      (showStatus || visibleWarnings.length || web.sources.length)
    "
    class="message-sources"
  >
    <p v-if="showStatus" class="web-status" role="status">
      {{ webStatusText[web.status] }}
    </p>
    <p v-for="warning in visibleWarnings" :key="warning.code" class="web-warning" role="status">
      {{ warning.message }}
    </p>
    <details v-if="web.sources.length" class="sources-details">
      <summary>
        {{ citedCount ? `引用 ${citedCount} 条来源` : '本回答未直接引用来源' }}
        <span>
          ·
          {{ web.sources.every((source) => !source.kind || source.kind === 'web') ? '检索到 ' : ''
          }}{{ web.sources.length }} 条资料</span
        >
      </summary>
      <p v-if="web.searched_at" class="search-time">
        检索于 <TimeDisplay :value="web.searched_at" /> · 依据相关片段
      </p>
      <ol>
        <li
          v-for="source in orderedSources"
          :key="source.id"
          :class="{ cited: citedIds.has(source.id) }"
        >
          <div>
            <button
              v-if="source.kind === 'document' || source.kind === 'image'"
              class="file-source"
              type="button"
              :disabled="source.deleted"
              @click="activeSource = source"
            >
              [{{ web.sources.findIndex((item) => item.id === source.id) + 1 }}]
              {{ source.title }} ·
              {{
                source.deleted
                  ? '资料已删除'
                  : source.summary
                    ? `分段摘要 · ${source.coverage?.map(attachmentLocation).join('、') || attachmentLocation(source.locator)}`
                    : attachmentLocation(source.locator) || '图片'
              }}
            </button>
            <a
              v-else-if="sourceUrl(source)"
              :href="sourceUrl(source)!"
              target="_blank"
              rel="noopener noreferrer"
            >
              [{{ web.sources.findIndex((item) => item.id === source.id) + 1 }}] {{ source.title }}
            </a>
            <span v-else>{{ source.title }}（链接不可用）</span>
            <span class="source-label">{{ citedIds.has(source.id) ? '已引用' : '仅检索' }}</span>
          </div>
          <span v-if="'domain' in source" class="source-domain">{{ source.domain }}</span>
          <span v-if="'published_at' in source && source.published_at" class="source-domain">
            · 发布于 <TimeDisplay :value="source.published_at"
          /></span>
          <p v-if="source.excerpt">{{ source.excerpt }}</p>
        </li>
      </ol>
    </details>
    <AttachmentViewer
      v-if="activeSource"
      :open="true"
      :attachment-id="activeSource.attachment_id"
      :name="activeSource.title"
      :image="activeSource.kind === 'image'"
      :chunk-id="activeSource.chunk_id"
      :revision="activeSource.revision"
      :deleted="activeSource.deleted"
      :summary-text="activeSource.summary ? activeSource.excerpt : undefined"
      :summary-coverage="activeSource.coverage?.map(attachmentLocation).join('、')"
      @close="activeSource = null"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import AttachmentViewer from '../attachments/AttachmentViewer.vue'
import { attachmentLocation } from '../../types/attachments'
import type { FileSource, AnswerSource } from '../../types/webSearch'
import type { WebSnapshot } from '../../types/webSearch'
import { safeWebUrl, webStatusText } from '../../utils/webSearch'
import TimeDisplay from '../ui/TimeDisplay.vue'

const activeSource = ref<FileSource | null>(null)
const props = defineProps<{ web?: WebSnapshot; pending?: boolean }>()
const showStatus = computed(() => props.web?.status === 'unavailable')
const visibleWarnings = computed(
  () =>
    props.web?.warnings?.filter(
      (warning) => !['WEB_EVIDENCE_TRUNCATED', 'WEB_DECISION_FAILED'].includes(warning.code),
    ) ?? [],
)
const citedIds = computed(() => new Set(props.web?.cited_source_ids ?? []))
const citedCount = computed(
  () => props.web?.sources.filter((source) => citedIds.value.has(source.id)).length ?? 0,
)
const orderedSources = computed(() =>
  [...(props.web?.sources ?? [])].sort(
    (a, b) => Number(citedIds.value.has(b.id)) - Number(citedIds.value.has(a.id)),
  ),
)
function sourceUrl(source: AnswerSource) {
  return 'url' in source ? safeWebUrl(source.url) : null
}
</script>

<style scoped>
.file-source {
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--blue);
  font: inherit;
  cursor: pointer;
  text-align: left;
}
.message-sources {
  font-size: 12px;
  color: var(--ink-3);
  margin-top: 8px;
  overflow-wrap: anywhere;
}
.web-status,
.web-warning,
.search-time {
  margin: 4px 0;
}
.web-warning {
  color: var(--ink-2);
}
.sources-details {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 8px 10px;
}
summary {
  cursor: pointer;
  color: var(--ink-2);
}
summary span {
  color: var(--ink-3);
}
ol {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}
li + li {
  border-top: 1px solid var(--line);
  margin-top: 8px;
  padding-top: 8px;
}
a {
  color: var(--blue);
}
li p {
  margin: 4px 0;
  line-height: 1.5;
}
.source-label {
  margin-left: 8px;
  font-size: 11px;
}
.cited .source-label {
  color: var(--blue);
}
.source-domain,
.search-time {
  font-size: 11px;
}
</style>
