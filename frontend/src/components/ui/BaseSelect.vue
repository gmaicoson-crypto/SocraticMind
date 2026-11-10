<template>
  <span class="ui-select">
    <button
      ref="triggerRef"
      type="button"
      role="combobox"
      class="ui-select-trigger"
      :disabled="unavailable"
      :aria-label="label"
      :aria-expanded="open"
      :aria-controls="open ? panelId : undefined"
      :aria-activedescendant="open && options[activeIndex] ? optionId(activeIndex) : undefined"
      @click="toggle"
      @keydown="onKeydown"
      @blur="close"
    >
      <span class="ui-select-text">{{ selectedLabel }}</span>
      <ChevronDown :size="14" aria-hidden="true" />
    </button>
    <input v-if="name" type="hidden" :name="name" :value="value" :disabled="unavailable" />
    <Teleport to="body">
      <div
        v-if="open"
        :id="panelId"
        ref="panelRef"
        class="ui-select-panel"
        role="listbox"
        :aria-label="label"
        :style="panelPosition"
      >
        <div
          v-for="(option, index) in options"
          :id="optionId(index)"
          :key="option.value"
          class="ui-select-option"
          :class="{ 'is-active': index === activeIndex }"
          role="option"
          :aria-selected="option.value === value"
          @mousedown.prevent
          @click="select(index)"
        >
          <span class="ui-select-text">{{ option.label }}</span>
          <Check v-if="option.value === value" :size="14" aria-hidden="true" />
        </div>
      </div>
    </Teleport>
  </span>
</template>

<script setup lang="ts" generic="Value extends string | number">
import { Check, ChevronDown } from '@lucide/vue'
import { computed, nextTick, ref, useId, watch, type CSSProperties } from 'vue'

const props = defineProps<{
  label: string
  options: readonly { value: Value; label: string }[]
  name?: string
  disabled?: boolean
}>()
const value = defineModel<Value>({ required: true })
const open = ref(false)
const activeIndex = ref(-1)
const panelId = useId()
const triggerRef = ref<HTMLButtonElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const panelPosition = ref<CSSProperties>({})
const unavailable = computed(() => props.disabled || props.options.length === 0)
const selectedIndex = computed(() =>
  props.options.findIndex((option) => option.value === value.value),
)
const selectedLabel = computed(() => props.options[selectedIndex.value]?.label ?? '请选择')
const maxPanelHeight = 240

function optionId(index: number) {
  return `${panelId}-option-${index}`
}

function positionPanel() {
  const anchor = triggerRef.value?.getBoundingClientRect()
  const panel = panelRef.value
  if (!anchor || !panel) return
  const inset = 8
  const gap = 4
  const width = Math.min(anchor.width, window.innerWidth - 2 * inset)
  const below = window.innerHeight - anchor.bottom - inset - gap
  const above = anchor.top - inset - gap
  const preferredHeight = Math.min(panel.scrollHeight + 2, maxPanelHeight)
  const opensUp = below < preferredHeight && above > below
  panelPosition.value = {
    left: `${Math.max(inset, Math.min(anchor.left, window.innerWidth - width - inset))}px`,
    width: `${width}px`,
    maxHeight: `${Math.max(0, Math.min(maxPanelHeight, opensUp ? above : below))}px`,
    ...(opensUp
      ? { bottom: `${window.innerHeight - anchor.top + gap}px` }
      : { top: `${anchor.bottom + gap}px` }),
  }
}

function close() {
  open.value = false
}

function scrollActiveOption() {
  panelRef.value?.querySelector('[role="option"].is-active')?.scrollIntoView?.({ block: 'nearest' })
}

async function show(initialIndex = 0) {
  if (unavailable.value) return
  triggerRef.value?.focus({ preventScroll: true })
  activeIndex.value = selectedIndex.value >= 0 ? selectedIndex.value : initialIndex
  open.value = true
  await nextTick()
  if (!open.value) return
  positionPanel()
  await nextTick()
  scrollActiveOption()
}

function toggle() {
  if (open.value) close()
  else void show()
}

function select(index: number) {
  const option = props.options[index]
  if (option && !unavailable.value) value.value = option.value
  close()
}

function onKeydown(event: KeyboardEvent) {
  const { key } = event
  const count = props.options.length
  if (key === 'ArrowDown' || key === 'ArrowUp') {
    event.preventDefault()
    const direction = key === 'ArrowDown' ? 1 : -1
    if (!open.value) {
      void show(direction === 1 ? 0 : count - 1)
      return
    }
    activeIndex.value = (activeIndex.value + direction + count) % count
  } else if (!open.value) {
    return
  } else if (key === 'Home' || key === 'End') {
    event.preventDefault()
    activeIndex.value = key === 'Home' ? 0 : count - 1
  } else if (key === 'Enter' || key === ' ') {
    event.preventDefault()
    select(activeIndex.value)
    return
  } else if (key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    close()
    return
  } else {
    return
  }
  void nextTick(scrollActiveOption)
}

watch(unavailable, (disabled) => {
  if (disabled) close()
})

watch(open, (isOpen, _, onCleanup) => {
  if (!isOpen) return
  const onOutsidePointerDown = (event: PointerEvent) => {
    if (
      event.target instanceof Node &&
      !triggerRef.value?.contains(event.target) &&
      !panelRef.value?.contains(event.target)
    ) {
      close()
    }
  }
  const onScroll = (event: Event) => {
    if (event.target !== panelRef.value) close()
  }
  document.addEventListener('pointerdown', onOutsidePointerDown, true)
  window.addEventListener('resize', positionPanel)
  window.addEventListener('scroll', onScroll, true)
  onCleanup(() => {
    document.removeEventListener('pointerdown', onOutsidePointerDown, true)
    window.removeEventListener('resize', positionPanel)
    window.removeEventListener('scroll', onScroll, true)
  })
})
</script>

<style scoped>
.ui-select {
  display: block;
  min-width: 0;
}
.ui-select-trigger,
.ui-select-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-width: 0;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.ui-select-trigger {
  width: 100%;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--bg);
  color: var(--ink);
  font-family: inherit;
}
.ui-select-trigger:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.ui-select-trigger[aria-expanded='true'] {
  border-color: var(--blue);
}
.ui-select-trigger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.ui-select-trigger svg,
.ui-select-option svg {
  flex: none;
}
.ui-select-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ui-select-panel {
  position: fixed;
  z-index: 200;
  display: grid;
  gap: 2px;
  padding: 4px;
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--line-2);
  border-radius: 10px;
  background: var(--surface-raised, var(--surface));
  box-shadow: var(--dropdown-shadow);
}
.ui-select-option {
  min-height: 32px;
  padding: 5px 8px;
  border-radius: 6px;
  color: var(--ink-2);
}
.ui-select-option:hover,
.ui-select-option.is-active {
  background: var(--bg-3);
  color: var(--ink);
}
.ui-select-option[aria-selected='true'] {
  background: var(--blue-soft);
  color: var(--ink);
}
</style>
