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
    <template v-if="chipsLoading">
      <div class="chips-loading">
        <span v-for="i in 4" :key="i" class="chip-skeleton" />
      </div>
    </template>
    <template v-else>
      <button v-for="chip in chips" :key="chip" class="chip" @click="$emit('update:input', chip)">
        {{ chip }}
      </button>
      <button class="chip-refresh" title="换一批" @click="$emit('refreshChips')">
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        >
          <path d="M1 4v6h6M23 20v-6h-6" />
          <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
        </svg>
      </button>
    </template>
  </div>

  <div class="input-wrap">
    <div class="input-toolbar">
      <div class="mode-switch">
        <button
          class="mode-btn"
          :class="{ active: chatMode === 'socratic' }"
          title="学习模式"
          @click="$emit('update:chatMode', 'socratic')"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5Z" />
          </svg>
          学习
          <span v-if="socraticBadge > 0" class="mode-badge">{{ socraticBadge }}</span>
        </button>
        <button
          class="mode-btn"
          :class="{ active: chatMode === 'normal' }"
          title="普通对话"
          @click="$emit('update:chatMode', 'normal')"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
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

    <div class="input-box">
      <textarea
        ref="textareaRef"
        :value="input"
        rows="1"
        :placeholder="placeholder"
        @input="onInput"
        @keydown.enter.exact.prevent="requestSend"
      />
      <button v-if="isThinking" class="abort-btn" title="中断回答" @click="$emit('abort')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <rect x="4" y="4" width="16" height="16" rx="2" />
        </svg>
        中断
      </button>
      <button
        v-else
        class="send-btn"
        :disabled="!input.trim() || isGenerating || sendDisabled"
        @click="requestSend"
      >
        <span v-if="isGenerating">处理中…</span>
        <template v-else>
          发送
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
          >
            <path d="M5 12 L19 12 M13 6 L19 12 L13 18" />
          </svg>
        </template>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
// DialogueInputBar 组件，封装局部界面和交互逻辑。
import { ref } from 'vue'
import ModelSelector from './ModelSelector.vue'

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
    sendDisabled?: boolean
    showChips?: boolean
  }>(),
  {
    sendDisabled: false,
    showChips: true,
  },
)

const emit = defineEmits<{
  (e: 'update:input', val: string): void
  (e: 'update:chatMode', val: 'socratic' | 'normal'): void
  (e: 'update:aiStyle', val: string): void
  (e: 'send'): void
  (e: 'abort'): void
  (e: 'clearQuote'): void
  (e: 'refreshChips'): void
}>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)

function onInput(e: Event) {
  const el = e.target as HTMLTextAreaElement
  emit('update:input', el.value)

  el.style.height = 'auto'
  const maxHeight = 110
  el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px'
  el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
}

function requestSend() {
  if (!props.sendDisabled && !props.isGenerating && props.input.trim()) emit('send')
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
  display: flex;
  gap: 6px;
  padding: 8px 14px;
  border-top: 1px solid var(--line);
  flex-shrink: 0;
  flex-wrap: wrap;
}
.chip {
  padding: 4px 10px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 999px;
  font-size: 11.5px;
  color: var(--ink-2);
  cursor: pointer;
  font-family: var(--font-sans);
  transition: all 0.15s;
}
.chip:hover {
  background: var(--blue-tint);
  color: var(--blue-2);
  border-color: var(--blue-line);
}
.chip-refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--ink-3);
  cursor: pointer;
  transition: all 0.15s;
}
.chip-refresh:hover {
  background: var(--bg-3);
  color: var(--ink);
  border-color: var(--line-2);
}
.chips-loading {
  display: flex;
  gap: 6px;
}
.chip-skeleton {
  display: inline-block;
  height: 24px;
  width: 80px;
  background: var(--loading-gradient);
  background-size: 200% 100%;
  border-radius: 999px;
  animation: shimmer 1.4s infinite;
}
@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
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
