<template>
  <div class="model-selector-wrap">
    <select
      ref="selectorRef"
      class="model-selector"
      :value="models.selectedModel?.id ?? ''"
      :disabled="models.loading"
      aria-label="选择模型"
      title="选择模型"
      @change="selectModel"
    >
      <option value="" disabled>
        {{ models.loading ? '加载模型中' : models.error ? '模型加载失败' : '选择模型' }}
      </option>
      <optgroup v-if="models.environmentModels.length" label="系统模型">
        <option v-for="model in models.environmentModels" :key="model.id" :value="model.id">
          {{ model.name }}
        </option>
      </optgroup>
      <optgroup v-if="models.customModels.length" label="我的模型">
        <option v-for="model in models.customModels" :key="model.id" :value="model.id">
          {{ model.name }}
        </option>
      </optgroup>
      <option value="__add__">添加模型</option>
      <option v-if="models.selectedModel?.source === 'custom'" value="__manage__">
        编辑或删除当前模型
      </option>
    </select>
    <ChevronDown class="model-selector-chevron" :size="12" aria-hidden="true" />
  </div>
  <ModelEditorModal v-model="showEditorModal" :model="editingModel" />
</template>

<script setup lang="ts">
import { ChevronDown } from '@lucide/vue'
import { nextTick, onMounted, ref, watch } from 'vue'
import type { CustomModelOption } from '../../api/models'
import ModelEditorModal from '../models/ModelEditorModal.vue'
import { useModelsStore } from '../../stores/models'

const models = useModelsStore()
const showEditorModal = ref(false)
const editingModel = ref<CustomModelOption | null>(null)
const selectorRef = ref<HTMLSelectElement | null>(null)

onMounted(() => {
  if (!models.models.length) models.fetchModels()
})

watch(showEditorModal, async (open) => {
  if (!open) {
    await nextTick()
    selectorRef.value?.focus()
  }
})

function selectModel(event: Event) {
  const target = event.target as HTMLSelectElement
  if (target.value === '__add__' || target.value === '__manage__') {
    editingModel.value =
      target.value === '__manage__' && models.selectedModel?.source === 'custom'
        ? models.selectedModel
        : null
    target.value = models.selectedModel?.id ?? ''
    showEditorModal.value = true
    return
  }
  models.setSelectedModel(target.value || null)
}
</script>

<style scoped>
.model-selector-wrap {
  position: relative;
  display: inline-flex;
  min-width: 0;
  max-width: 100%;
}

.model-selector {
  appearance: none;
  width: 120px;
  min-width: 100px;
  max-width: 100%;
  padding: 3px 22px 3px 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg-2);
  color: var(--ink-2);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.model-selector:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 1px;
}

.model-selector:disabled {
  cursor: wait;
  opacity: 0.7;
}

.model-selector-chevron {
  position: absolute;
  top: 50%;
  right: 6px;
  transform: translateY(-50%);
  pointer-events: none;
}

.model-selector:disabled + .model-selector-chevron {
  opacity: 0.7;
}

@container (max-width: 400px) {
  .model-selector {
    width: clamp(100px, 30cqw, 120px);
  }
}
</style>
