<template>
  <div
    v-if="drafts?.length || attachments?.length"
    class="attachment-list"
    :class="{ horizontal }"
    :role="horizontal ? 'region' : undefined"
    :tabindex="horizontal ? 0 : undefined"
    aria-label="附件列表"
    :title="horizontal ? '左右滑动查看附件' : undefined"
  >
    <AttachmentCard
      v-for="draft in drafts"
      :key="draft.clientId"
      :attachment="draft.attachment"
      :draft="draft"
      @remove="emit('remove', $event)"
      @retry="emit('retry', $event)"
      @accept="emit('accept', $event)"
    />
    <AttachmentCard
      v-for="attachment in attachments"
      :key="attachment.id"
      :attachment="attachment"
    />
  </div>
</template>
<script setup lang="ts">
import type { AttachmentDraft, AttachmentSummary } from '../../types/attachments'
import AttachmentCard from './AttachmentCard.vue'
defineProps<{
  drafts?: AttachmentDraft[]
  attachments?: AttachmentSummary[]
  horizontal?: boolean
}>()
const emit = defineEmits<{ remove: [id: string]; retry: [id: string]; accept: [id: string] }>()
</script>
<style scoped>
.attachment-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 6px 0;
  max-width: 100%;
}
.attachment-list.horizontal {
  width: 100%;
  min-width: 0;
  flex-wrap: nowrap;
  align-items: flex-start;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 4px;
  scroll-snap-type: x proximity;
  overscroll-behavior-x: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--line-2) transparent;
}
.attachment-list.horizontal :deep(.attachment-card) {
  flex-shrink: 0;
  scroll-snap-align: start;
}
.attachment-list.horizontal:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 2px;
}
</style>
