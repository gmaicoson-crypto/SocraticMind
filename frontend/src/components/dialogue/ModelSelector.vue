<template>
  <div
    ref="rootRef"
    class="model-selector-wrap"
    @pointerenter="onPointerEnter"
    @pointerleave="onPointerLeave"
    @keydown.esc="onEscape"
    @focusout="onFocusOut"
  >
    <button
      ref="selectorRef"
      type="button"
      class="model-selector"
      :disabled="models.loading"
      :aria-label="models.selectedModel ? `选择模型，当前：${selectedLabel}` : selectedLabel"
      :aria-expanded="open"
      :aria-controls="open ? panelId : undefined"
      :title="selectedLabel"
      @click="toggle"
      @keydown.down.prevent="showOptions"
      @keydown.up.prevent="showOptions"
    >
      <span class="model-name">{{ selectedLabel }}</span>
      <ChevronDown class="model-selector-chevron" :size="12" aria-hidden="true" />
    </button>
    <div
      v-if="open"
      :id="panelId"
      ref="panelRef"
      class="model-panel"
      :style="panelPosition"
      @keydown="onPanelKeydown"
    >
      <div v-if="models.models.length" class="model-options" role="group" aria-label="可用模型">
        <button
          v-for="model in models.models"
          :key="model.id"
          type="button"
          class="model-option"
          :aria-pressed="model.id === models.selectedModelId"
          :title="modelLabel(model)"
          @click="selectModel(model.id)"
        >
          <span class="model-name">{{ modelLabel(model) }}</span>
          <Check v-if="model.id === models.selectedModelId" :size="14" aria-hidden="true" />
        </button>
      </div>
      <div class="model-actions">
        <button type="button" @click="openEditor(null)">
          <Plus :size="14" aria-hidden="true" />
          添加模型
        </button>
        <button
          type="button"
          :disabled="!editableModel"
          title="编辑或删除当前自定义模型"
          @click="openEditor(editableModel)"
        >
          <Pencil :size="14" aria-hidden="true" />
          编辑模型
        </button>
      </div>
    </div>
  </div>
  <ModelEditorModal v-model="showEditorModal" :model="editingModel" />
</template>

<script setup lang="ts">
import { Check, ChevronDown, Pencil, Plus } from '@lucide/vue'
import { computed, nextTick, onMounted, ref, useId, watch, type CSSProperties } from 'vue'
import type { CustomModelOption, LLMModelOption } from '../../api/models'
import ModelEditorModal from '../models/ModelEditorModal.vue'
import { useModelsStore } from '../../stores/models'

const models = useModelsStore()
const open = ref(false)
const panelId = useId()
const rootRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const selectorRef = ref<HTMLButtonElement | null>(null)
const panelPosition = ref<CSSProperties>({})
const showEditorModal = ref(false)
const editingModel = ref<CustomModelOption | null>(null)
let openedByHover = false
let closeTimer: ReturnType<typeof setTimeout> | undefined
const editableModel = computed(() =>
  models.selectedModel?.source === 'custom' ? models.selectedModel : null,
)
const selectedLabel = computed(() => {
  if (models.loading) return '加载模型中'
  if (models.selectedModel) return modelLabel(models.selectedModel)
  return models.error ? '模型加载失败' : '选择模型'
})

onMounted(() => {
  if (!models.models.length) models.fetchModels()
})

watch(showEditorModal, async (open) => {
  if (!open) {
    await nextTick()
    selectorRef.value?.focus()
  }
})

watch(open, (isOpen, _previous, onCleanup) => {
  if (!isOpen) return
  const onOutsidePointerDown = (event: PointerEvent) => {
    if (event.target instanceof Node && !rootRef.value?.contains(event.target)) close()
  }
  const onDocumentEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && openedByHover) close()
  }
  document.addEventListener('pointerdown', onOutsidePointerDown, true)
  document.addEventListener('keydown', onDocumentEscape)
  window.addEventListener('resize', positionPanel)
  onCleanup(() => {
    clearTimeout(closeTimer)
    document.removeEventListener('pointerdown', onOutsidePointerDown, true)
    document.removeEventListener('keydown', onDocumentEscape)
    window.removeEventListener('resize', positionPanel)
  })
})

function modelLabel(model: LLMModelOption) {
  return model.source === 'custom' ? model.name : model.model
}

function toggle() {
  if (open.value && !openedByHover) return close(true)
  return showOptions()
}

function positionPanel() {
  const anchor = selectorRef.value?.getBoundingClientRect()
  if (!anchor) return
  const inset = 8
  const gap = 6
  const width = Math.min(220, window.innerWidth - inset * 2)
  const maxLeft = window.innerWidth - width - inset
  const rightSide = anchor.right + gap <= maxLeft
  const left = rightSide ? anchor.right + gap : anchor.right - width
  const bottom = rightSide ? anchor.bottom : anchor.top - gap
  panelPosition.value = {
    left: `${Math.max(inset, Math.min(left, maxLeft))}px`,
    bottom: `${Math.max(inset, window.innerHeight - bottom)}px`,
    width: `${width}px`,
  }
}

function onPointerEnter(event: PointerEvent) {
  if (event.pointerType !== 'mouse') return
  clearTimeout(closeTimer)
  if (open.value || models.loading || showEditorModal.value) return
  positionPanel()
  openedByHover = true
  open.value = true
}

function onPointerLeave(event: PointerEvent) {
  if (event.pointerType !== 'mouse' || !openedByHover) return
  // Give the pointer time to cross the gap between the trigger and panel.
  closeTimer = setTimeout(() => {
    if (!panelRef.value?.contains(document.activeElement)) close()
  }, 180)
}

async function showOptions() {
  clearTimeout(closeTimer)
  positionPanel()
  openedByHover = false
  open.value = true
  await nextTick()
  const panel = panelRef.value
  const initialButton =
    panel?.querySelector<HTMLButtonElement>('[aria-pressed="true"]') ??
    panel?.querySelector<HTMLButtonElement>('button')
  initialButton?.focus()
}

function onPanelKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  const buttons = Array.from(
    panelRef.value?.querySelectorAll<HTMLButtonElement>('button:enabled') ?? [],
  )
  const current = buttons.findIndex((button) => button === event.target)
  if (current < 0) return
  event.preventDefault()
  const offset = event.key === 'ArrowDown' ? 1 : -1
  buttons[(current + offset + buttons.length) % buttons.length]?.focus()
}

function close(restoreFocus = false) {
  clearTimeout(closeTimer)
  openedByHover = false
  open.value = false
  if (restoreFocus) selectorRef.value?.focus()
}

function onEscape(event: KeyboardEvent) {
  if (!open.value) return
  event.preventDefault()
  event.stopPropagation()
  close(true)
}

function onFocusOut(event: FocusEvent) {
  if (event.relatedTarget instanceof Node && !rootRef.value?.contains(event.relatedTarget)) close()
}

function selectModel(id: string) {
  models.setSelectedModel(id)
  close(true)
}

function openEditor(model: CustomModelOption | null) {
  editingModel.value = model
  close()
  showEditorModal.value = true
}
</script>

<style scoped>
.model-selector-wrap {
  display: inline-flex;
  min-width: 0;
  max-width: 100%;
}

.model-selector {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 120px;
  min-width: 100px;
  max-width: 100%;
  padding: 3px 6px 3px 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg-2);
  color: var(--ink-2);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.model-selector-wrap button:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 1px;
}

.model-selector:disabled {
  cursor: wait;
  opacity: 0.7;
}

.model-selector-chevron {
  flex: none;
}

.model-selector[aria-expanded='true'] {
  border-color: var(--blue);
}

.model-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-panel {
  position: fixed;
  z-index: 5;
  padding: 4px;
  border: 1px solid var(--line-2);
  border-radius: 10px;
  background: var(--surface-raised, var(--surface));
  box-shadow: var(--dropdown-shadow);
}

.model-options {
  display: grid;
  gap: 2px;
  max-height: min(240px, 35dvh);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.model-panel button {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  min-height: 32px;
  padding: 5px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ink-2);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.model-panel button:focus-visible {
  outline-offset: -2px;
}

.model-panel button:hover:not(:disabled) {
  background: var(--bg-3);
  color: var(--ink);
}

.model-option {
  justify-content: space-between;
}

.model-option[aria-pressed='true'] {
  background: var(--blue-soft);
  color: var(--ink);
}

.model-panel svg {
  flex: none;
}

.model-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}

.model-options + .model-actions {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid var(--line);
}

.model-actions button {
  justify-content: center;
  white-space: nowrap;
}

.model-actions button:disabled {
  opacity: 0.5;
  cursor: default;
}

@container (max-width: 400px) {
  .model-selector {
    width: clamp(100px, 30cqw, 120px);
  }
}
</style>
