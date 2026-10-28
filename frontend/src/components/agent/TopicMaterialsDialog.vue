<template>
  <ConfirmDialog
    :model-value="true"
    title="主题学习资料"
    confirm-text="保存资料"
    :loading="saving"
    @close="close"
    @update:model-value="(value) => !value && close()"
    @confirm="save"
  >
    <p>新对话使用保存后的资料范围。移除资料后，相关引用将显示为不可用。</p>
    <MaterialSelector v-model="materials" :topic-id="topicId" :busy="saving" auto-open />
    <p v-if="error" role="alert">{{ error }}</p>
  </ConfirmDialog>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { parseApiError } from '../../api'
import { setTopicMaterials } from '../../api/knowledge'
import type { MaterialRef } from '../../types/knowledge'
import ConfirmDialog from '../ui/ConfirmDialog.vue'
import MaterialSelector from './MaterialSelector.vue'

const props = defineProps<{ topicId: number }>()
const emit = defineEmits<{ close: []; busy: [value: boolean] }>()
const materials = ref<MaterialRef[]>()
const saving = ref(false)
const error = ref('')
const controller = new AbortController()

function close() {
  if (!saving.value) emit('close')
}

async function save() {
  if (saving.value) return
  if (materials.value === undefined) {
    error.value = '请等待资料加载完成，失败后可点击刷新。'
    return
  }
  saving.value = true
  emit('busy', true)
  error.value = ''
  try {
    await setTopicMaterials(props.topicId, materials.value, controller.signal)
    if (!controller.signal.aborted) emit('close')
  } catch (cause) {
    if (!controller.signal.aborted) error.value = parseApiError(cause).message
  } finally {
    if (!controller.signal.aborted) {
      saving.value = false
      emit('busy', false)
    }
  }
}

onBeforeUnmount(() => controller.abort())
</script>
