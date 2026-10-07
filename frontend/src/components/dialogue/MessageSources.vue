<template>
  <div v-if="web && web.status !== 'off'" class="message-sources">
    <p v-if="!web.sources.length || web.status !== 'ready'" class="web-status" role="status">
      {{
        !pending && ['deciding', 'searching'].includes(web.status)
          ? '联网过程已中断'
          : webStatusText[web.status]
      }}
    </p>
    <p v-for="warning in visibleWarnings" :key="warning.code" class="web-warning" role="status">
      {{ warning.message }}
    </p>
    <details v-if="web.sources.length" class="sources-details">
      <summary>
        {{
          pending
            ? '正在整理来源'
            : citedCount
              ? `引用 ${citedCount} 条来源`
              : '本回答未直接引用来源'
        }}
        <span> · 检索到 {{ web.sources.length }} 条资料</span>
      </summary>
      <p v-if="web.searched_at" class="search-time">
        检索于 {{ displayTime(web.searched_at) }} · 依据相关片段
      </p>
      <ol>
        <li
          v-for="source in orderedSources"
          :key="source.id"
          :class="{ cited: citedIds.has(source.id) }"
        >
          <div>
            <a
              v-if="safeWebUrl(source.url)"
              :href="safeWebUrl(source.url)!"
              target="_blank"
              rel="noopener noreferrer"
            >
              [{{ web.sources.findIndex((item) => item.id === source.id) + 1 }}] {{ source.title }}
            </a>
            <span v-else>{{ source.title }}（链接不可用）</span>
            <span class="source-label">{{
              citedIds.has(source.id) ? '已引用' : pending ? '候选资料' : '仅检索'
            }}</span>
          </div>
          <span class="source-domain">{{ source.domain }}</span>
          <span v-if="source.published_at" class="source-domain">
            · 发布于 {{ displayTime(source.published_at) }}</span
          >
          <p v-if="source.excerpt">{{ source.excerpt }}</p>
        </li>
      </ol>
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { WebSnapshot } from '../../types/webSearch'
import { safeWebUrl, webStatusText } from '../../utils/webSearch'

const props = defineProps<{ web?: WebSnapshot; pending?: boolean }>()
const visibleWarnings = computed(
  () => props.web?.warnings?.filter((warning) => warning.code !== 'WEB_EVIDENCE_TRUNCATED') ?? [],
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
function displayTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN')
}
</script>

<style scoped>
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
