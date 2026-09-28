<template>
  <select
    class="model-selector"
    :value="models.selectedModelId ?? ''"
    :disabled="models.loading || models.models.length === 0"
    aria-label="选择模型"
    title="选择模型"
    @change="selectModel"
  >
    <option v-if="models.models.length === 0" value="">
      {{ models.loading ? '加载模型…' : '暂无模型' }}
    </option>
    <option v-for="model in models.models" :key="model.id" :value="model.id">
      {{ model.name }}
    </option>
  </select>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useModelsStore } from '../../stores/models'

const models = useModelsStore()

onMounted(() => {
  if (!models.models.length) models.fetchModels()
})

function selectModel(event: Event) {
  models.setSelectedModel((event.target as HTMLSelectElement).value || null)
}
</script>

<style scoped>
.model-selector {
  width: 132px;
  min-width: 108px;
  max-width: 100%;
  padding: 4px 25px 4px 10px;
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

@container (max-width: 400px) {
  .model-selector {
    width: clamp(100px, 32cqw, 132px);
  }
}

@container (max-width: 320px) {
  .model-selector {
    min-width: 100px;
  }
}
</style>
