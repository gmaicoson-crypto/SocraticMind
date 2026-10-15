<template>
  <div class="chips-wrap">
    <div ref="chipsContentRef" class="chips-content">
      <div class="chips-list" :style="{ gap: `${chipGap}px` }">
        <button
          v-for="chip in visibleChips"
          :key="chip"
          class="chip"
          :disabled="isThinking || isGenerating || sendDisabled"
          @click="$emit('sendSuggestion', chip)"
        >
          {{ chip }}
        </button>
      </div>
      <button
        class="chip-refresh ui-icon-button"
        type="button"
        title="换一批"
        aria-label="换一批推荐对话"
        :disabled="chipsLoading"
        @click="$emit('refreshChips', visibleChips)"
      >
        <RefreshCcw :size="14" aria-hidden="true" />
      </button>
      <div ref="chipsMeasureRef" class="chips-measure" aria-hidden="true">
        <button v-for="chip in chips" :key="chip" class="chip" tabindex="-1" type="button">
          {{ chip }}
        </button>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RefreshCcw } from '@lucide/vue'
const props = defineProps<{
  chips: string[]
  chipsLoading: boolean
  isThinking: boolean
  isGenerating: boolean
  sendDisabled: boolean
}>()
defineEmits<{ sendSuggestion: [text: string]; refreshChips: [visible: string[]] }>()
const chipsContentRef = ref<HTMLElement | null>(null)
const chipsMeasureRef = ref<HTMLElement | null>(null)
const visibleChipCount = ref(0)
const chipGap = ref(6)
const visibleChips = computed(() => props.chips.slice(0, visibleChipCount.value))
let chipsResizeObserver: ResizeObserver | null = null

function updateVisibleChips() {
  const content = chipsContentRef.value
  const measured = chipsMeasureRef.value
  if (!content || !measured) return

  // Count with minimum spacing so widening the buttons cannot remove a suggestion.
  const available = content.clientWidth - 26 - 14
  const minGap = 6
  let used = 0
  let count = 0
  for (const chip of measured.children) {
    const width = (chip as HTMLElement).getBoundingClientRect().width
    if (used + width + (count > 0 ? minGap : 0) > available) break
    used += width + (count > 0 ? minGap : 0)
    count += 1
  }
  visibleChipCount.value = Math.max(1, count)
  chipGap.value =
    count > 1 ? minGap + Math.min(4, (Math.max(0, available - used) / (count - 1)) * 0.25) : minGap
}

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') {
    chipsResizeObserver = new ResizeObserver(updateVisibleChips)
    if (chipsContentRef.value) chipsResizeObserver.observe(chipsContentRef.value)
  }
  nextTick(updateVisibleChips)
})

onBeforeUnmount(() => chipsResizeObserver?.disconnect())
watch(
  chipsContentRef,
  (content, previous) => {
    if (previous) chipsResizeObserver?.unobserve(previous)
    if (content) chipsResizeObserver?.observe(content)
    nextTick(updateVisibleChips)
  },
  { flush: 'post' },
)
watch(
  () => props.chips,
  () => nextTick(updateVisibleChips),
)
</script>
<style scoped>
.chips-wrap {
  padding: 8px 14px;
  border-top: 1px solid var(--line);
  flex-shrink: 0;
}

.chips-content {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  position: relative;
}

.chips-list {
  display: flex;
  flex: 1 1 0;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
}

.chip {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 100%;
  padding: 4px 10px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 999px;
  font-size: 11.5px;
  color: var(--ink-2);
  cursor: pointer;
  font-family: var(--font-sans);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: all 0.15s;
}

.chip:hover {
  background: var(--blue-tint);
  color: var(--blue-2);
  border-color: var(--blue-line);
}

.chip:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.chip:disabled:hover {
  background: var(--bg-2);
  color: var(--ink-2);
  border-color: var(--line);
}

.chip-refresh {
  display: inline-flex;
  flex: 0 0 26px;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  cursor: pointer;
  transition: all 0.15s;
}

.chips-measure {
  display: flex;
  gap: 6px;
  position: absolute;
  top: 0;
  left: 0;
  width: max-content;
  visibility: hidden;
  pointer-events: none;
}

.chips-measure .chip {
  max-width: none;
}
</style>
