<template>
  <MessageSources v-if="sources.length" :web="snapshot" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import MessageSources from '../dialogue/MessageSources.vue'
import type { FileSource, WebSnapshot } from '../../types/webSearch'

const props = defineProps<{ sources: FileSource[]; citedIds?: string[] }>()
const snapshot = computed<WebSnapshot>(() => ({
  schema_version: 1,
  requested_mode: 'off',
  status: 'ready',
  queries: [],
  searched_at: null,
  sources: props.sources,
  cited_source_ids: props.citedIds ?? [],
}))
</script>
