<template>
  <div v-if="quotedText" class="quote-preview">
    <div class="quote-preview-content">
      <span class="quote-preview-bar" />
      <span class="quote-preview-text"
        >{{ quotedText.slice(0, 80) }}{{ quotedText.length > 80 ? '…' : '' }}</span
      >
    </div>
    <button class="quote-clear" title="取消引用" @click="$emit('clearQuote')">✕</button>
  </div>

  <div v-if="showChips" class="chips-wrap">
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

  <div class="input-wrap" @dragover.prevent @drop.prevent="dropFiles">
    <div class="input-toolbar">
      <div class="mode-switch">
        <button
          class="mode-btn"
          :class="{ active: chatMode === 'socratic' }"
          :disabled="modeSwitchDisabled"
          title="学习模式"
          @click="$emit('update:chatMode', 'socratic')"
        >
          <Sparkles :size="13" aria-hidden="true" />
          学习
          <span v-if="socraticBadge > 0" class="mode-badge">{{ socraticBadge }}</span>
        </button>
        <button
          class="mode-btn"
          :class="{ active: chatMode === 'normal' }"
          :disabled="modeSwitchDisabled"
          title="普通对话"
          @click="$emit('update:chatMode', 'normal')"
        >
          <MessageSquare :size="13" aria-hidden="true" />
          对话
          <span v-if="normalBadge > 0" class="mode-badge">{{ normalBadge }}</span>
        </button>
      </div>
      <div class="ai-controls">
        <ModelSelector />
        <Transition name="fade-slide">
          <div v-if="chatMode === 'socratic'" class="style-switch">
            <button
              v-for="s in aiStyleOptions"
              :key="s"
              class="style-btn"
              :class="{ active: aiStyle === s }"
              @click="$emit('update:aiStyle', s)"
            >
              {{ s }}
            </button>
          </div>
        </Transition>
      </div>
    </div>

    <AttachmentList
      :drafts="attachments"
      horizontal
      @remove="emit('removeAttachment', $event)"
      @retry="emit('retryAttachment', $event)"
      @accept="emit('acceptCoverage', $event)"
    />
    <input
      ref="fileInput"
      type="file"
      multiple
      :accept="attachmentAccept"
      hidden
      @change="chooseFiles"
    />
    <div v-if="!attachmentAccept" class="attachment-toolbar">
      <button type="button" @click="emit('reloadAttachmentService')">重新加载附件服务</button>
    </div>
    <p v-if="attachmentError" class="attachment-error" role="alert">{{ attachmentError }}</p>
    <div class="input-box">
      <textarea
        ref="textareaRef"
        :value="input"
        rows="1"
        :placeholder="placeholder"
        aria-label="输入消息"
        @input="onInput"
        @paste="pasteFiles"
        @keydown.enter.exact.prevent="requestSend"
      />
      <IconButton
        class="attachment-btn"
        label="添加图片或文档"
        :disabled="!canAddAttachments"
        :title="attachmentDisabledReason || '上传图片、Word、PDF、PPT'"
        @click="fileInput?.click()"
      >
        <Plus :size="14" aria-hidden="true" />
      </IconButton>
      <button v-if="isThinking" class="abort-btn" title="中断回答" @click="$emit('abort')">
        <Square :size="12" class="icon-inherit" aria-hidden="true" />
        中断
      </button>
      <button
        v-else
        class="send-btn"
        :disabled="
          (!input.trim() && (attachmentsDisabled || !attachments.length)) ||
          isGenerating ||
          sendDisabled ||
          (!attachmentsDisabled && attachments.length > 0 && !attachmentsReady)
        "
        @click="requestSend"
      >
        <span v-if="isGenerating">处理中…</span>
        <template v-else>
          {{ sendLabel }}
          <ArrowRight :size="13" class="icon-inherit" aria-hidden="true" />
        </template>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
// DialogueInputBar 组件，封装局部界面和交互逻辑。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowRight, MessageSquare, Plus, RefreshCcw, Sparkles, Square } from '@lucide/vue'
import ModelSelector from './ModelSelector.vue'
import AttachmentList from '../attachments/AttachmentList.vue'
import IconButton from '../ui/IconButton.vue'
import type { AttachmentDraft } from '../../types/attachments'

const props = withDefaults(
  defineProps<{
    input: string
    chatMode: 'socratic' | 'normal'
    aiStyle: string
    aiStyleOptions: readonly string[]
    chips: string[]
    chipsLoading: boolean
    quotedText: string
    isThinking: boolean
    isGenerating: boolean
    socraticBadge: number
    normalBadge: number
    placeholder: string
    attachments?: AttachmentDraft[]
    attachmentsReady?: boolean
    attachmentsDisabled?: boolean
    attachmentDisabledReason?: string
    attachmentAccept?: string
    attachmentError?: string
    sendDisabled?: boolean
    showChips?: boolean
    modeSwitchDisabled?: boolean
    sendLabel?: string
  }>(),
  {
    attachments: () => [],
    attachmentsReady: true,
    attachmentsDisabled: true,
    attachmentDisabledReason: '当前阶段不能添加附件',
    attachmentAccept: '',
    attachmentError: '',
    sendDisabled: false,
    showChips: true,
    modeSwitchDisabled: false,
    sendLabel: '发送',
  },
)

const emit = defineEmits<{
  (e: 'update:input', val: string): void
  (e: 'update:chatMode', val: 'socratic' | 'normal'): void
  (e: 'update:aiStyle', val: string): void
  (e: 'reloadAttachmentService'): void
  (e: 'addAttachments', files: File[]): void
  (e: 'removeAttachment', id: string): void
  (e: 'retryAttachment', id: string): void
  (e: 'acceptCoverage', id: string): void
  (e: 'send'): void
  (e: 'abort'): void
  (e: 'clearQuote'): void
  (e: 'refreshChips', visibleChips: string[]): void
  (e: 'sendSuggestion', val: string): void
}>()

const fileInput = ref<HTMLInputElement | null>(null)
const canAddAttachments = computed(
  () => !props.attachmentsDisabled && !props.isThinking && Boolean(props.attachmentAccept),
)
function addFiles(files: File[]) {
  if (canAddAttachments.value && files.length) emit('addAttachments', files)
}
function chooseFiles(event: Event) {
  const el = event.target as HTMLInputElement
  addFiles(Array.from(el.files ?? []))
  el.value = ''
}
function dropFiles(event: DragEvent) {
  addFiles(Array.from(event.dataTransfer?.files ?? []))
}
function pasteFiles(event: ClipboardEvent) {
  if (!canAddAttachments.value) return
  const clipboard = event.clipboardData
  const files = Array.from(clipboard?.files ?? [])
  if (!files.length) {
    for (const item of Array.from(clipboard?.items ?? [])) {
      const file = item.kind === 'file' ? item.getAsFile() : null
      if (file) files.push(file)
    }
  }
  const images = files.filter((file) => file.type.startsWith('image/'))
  if (images.length) {
    event.preventDefault()
    addFiles(images)
  }
}
const textareaRef = ref<HTMLTextAreaElement | null>(null)
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

function onInput(e: Event) {
  const el = e.target as HTMLTextAreaElement
  emit('update:input', el.value)

  el.style.height = 'auto'
  const maxHeight = 110
  el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px'
  el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
}

function requestSend() {
  if (
    props.isThinking ||
    props.sendDisabled ||
    props.isGenerating ||
    (!props.input.trim() && (props.attachmentsDisabled || !props.attachments.length))
  )
    return
  if (!props.attachmentsDisabled && props.attachments.length && !props.attachmentsReady) return
  emit('send')
}

function reset() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.overflowY = 'hidden'
}

function focus() {
  textareaRef.value?.focus()
}

defineExpose({ reset, focus })
</script>

<style scoped>
.attachment-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 0;
  font-size: 11px;
  color: var(--ink-3);
}
.attachment-toolbar button {
  border: 1px solid var(--line);
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--bg-2);
  color: var(--ink-2);
  cursor: pointer;
}
.attachment-error {
  font-size: 12px;
  color: var(--danger, #c04b4b);
  margin: 6px 0;
}
.quote-preview {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: var(--blue-tint);
  border-top: 1px solid var(--blue-line);
  flex-shrink: 0;
}
.quote-preview-content {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.quote-preview-bar {
  width: 3px;
  height: 16px;
  background: var(--blue);
  border-radius: 2px;
  flex-shrink: 0;
}
.quote-preview-text {
  font-size: 11.5px;
  color: var(--ink-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.quote-clear {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--ink-3);
  font-size: 14px;
  padding: 0 6px;
  border-radius: 4px;
}
.quote-clear:hover {
  background: var(--surface);
  color: var(--ink);
}

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
.input-wrap {
  flex-shrink: 0;
  padding: 10px 14px 12px;
  border-top: 1px solid var(--line);
  background: var(--surface);
}
.input-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  min-height: 24px;
}
.ai-controls {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
  flex: 0 1 auto;
}
.mode-switch {
  display: inline-flex;
  flex: 0 0 auto;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 2px;
}
.mode-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  background: transparent;
  color: var(--ink-3);
  border: none;
  border-radius: 6px;
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  font-family: var(--font-sans);
  transition: all 0.15s;
  position: relative;
  white-space: nowrap;
}
.mode-btn:hover:not(.active) {
  color: var(--ink);
}
.mode-btn.active {
  background: var(--surface);
  color: var(--blue-2);
  box-shadow: var(--control-shadow);
}
.mode-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.mode-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  background: var(--blue-2);
  color: var(--on-accent);
  border-radius: 999px;
  font-size: 9.5px;
  font-family: var(--font-mono);
  font-weight: 600;
}

.style-switch {
  display: inline-flex;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 2px;
  gap: 0;
}
.style-btn {
  padding: 4px 10px;
  background: transparent;
  color: var(--ink-3);
  border: none;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  font-family: var(--font-sans);
  transition: all 0.15s;
  white-space: nowrap;
}
.style-btn:hover:not(.active) {
  color: var(--ink);
}
.style-btn.active {
  background: var(--surface);
  color: var(--blue-2);
  box-shadow: var(--control-shadow);
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition:
    opacity 0.2s,
    transform 0.2s;
}
.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateX(8px);
}

@container (max-width: 400px) {
  .input-toolbar {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .ai-controls {
    width: 100%;
    justify-content: flex-end;
  }
}

@container (max-width: 420px) {
  .ai-controls {
    justify-content: space-between;
  }
}

.input-box {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 8px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 12px;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.input-box:focus-within {
  border-color: var(--blue);
  box-shadow: 0 0 0 3px var(--focus-ring);
}
.input-box textarea {
  flex: 1;
  min-width: 0;
  resize: none;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  font-family: var(--font-sans);
  color: var(--ink);
  line-height: 1.55;
  max-height: 110px;
  min-height: 22px;
}
.input-box textarea::placeholder {
  color: var(--ink-3);
}

.attachment-btn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  padding: 0;
  line-height: 1;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
}
.attachment-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.send-btn,
.abort-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  background: var(--send-bg);
  color: var(--send-text);
  border: none;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  font-family: var(--font-sans);
  transition: background 0.15s;
  flex-shrink: 0;
}
.send-btn:hover:not(:disabled) {
  background: var(--blue);
}
.send-btn:disabled {
  background: var(--ink-3);
  cursor: not-allowed;
}
.abort-btn {
  background: var(--abort-bg);
}
.abort-btn:hover {
  background: var(--abort-hover-bg);
}
</style>
