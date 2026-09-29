<template>
  <BaseModal :model-value="modelValue" :close-disabled="busy" @close="close">
    <div class="model-overlay" @click.self="close">
      <section class="model-dialog" role="dialog" aria-modal="true" :aria-labelledby="titleId">
        <header class="model-header">
          <h2 :id="titleId">{{ model ? '编辑模型' : '添加模型' }}</h2>
          <button type="button" class="close-button" aria-label="关闭" title="关闭" @click="close">
            ×
          </button>
        </header>
        <form class="model-form" @submit.prevent="save">
          <label>
            官方模型名称（MODEL）
            <input
              ref="firstInput"
              v-model="form.model"
              maxlength="200"
              placeholder="例如 deepseek-chat"
              :disabled="busy"
            />
          </label>
          <label>
            API_KEY
            <input
              v-model="form.api_key"
              type="password"
              autocomplete="new-password"
              maxlength="1000"
              :placeholder="model ? '留空表示保持原密钥' : '输入服务商 API Key'"
              :disabled="busy"
            />
          </label>
          <label>
            请求地址（BASE_URL）
            <input
              v-model="form.base_url"
              maxlength="500"
              placeholder="https://api.example.com/v1"
              :disabled="busy"
            />
          </label>
          <label>
            自定义展示名称（NAME）
            <input
              v-model="form.name"
              maxlength="100"
              placeholder="例如 我的 DeepSeek"
              :disabled="busy"
            />
          </label>
          <p v-if="formError" class="error-message" role="alert">{{ formError }}</p>
          <div class="form-actions">
            <button
              v-if="model"
              type="button"
              class="delete-button"
              :disabled="busy"
              @click="remove"
            >
              {{ deleting ? '删除中…' : '删除模型' }}
            </button>
            <button type="button" class="secondary-button" :disabled="busy" @click="close">
              取消
            </button>
            <button type="submit" class="primary-button" :disabled="busy">
              {{ saving ? '保存中…' : model ? '保存修改' : '添加模型' }}
            </button>
          </div>
        </form>
      </section>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, useId, watch } from 'vue'
import { parseApiError } from '../../api'
import type { CustomModelOption } from '../../api/models'
import { useModelsStore } from '../../stores/models'
import BaseModal from '../ui/BaseModal.vue'

const props = defineProps<{
  modelValue: boolean
  model?: CustomModelOption | null
}>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const models = useModelsStore()
const titleId = useId()
const firstInput = ref<HTMLInputElement | null>(null)
const saving = ref(false)
const deleting = ref(false)
const busy = computed(() => saving.value || deleting.value)
const formError = ref('')
const form = reactive({ name: '', api_key: '', base_url: 'https://api.openai.com/v1', model: '' })

watch(
  () => [props.modelValue, props.model?.id] as const,
  async ([open]) => {
    if (!open) return
    form.name = props.model?.name ?? ''
    form.api_key = ''
    form.base_url = props.model?.base_url ?? 'https://api.openai.com/v1'
    form.model = props.model?.model ?? ''
    formError.value = ''
    await nextTick()
    firstInput.value?.focus()
  },
  { immediate: true },
)

function close() {
  if (!busy.value) emit('update:modelValue', false)
}

async function save() {
  if (busy.value) return
  formError.value = ''
  if (!form.name.trim() || !form.base_url.trim() || !form.model.trim()) {
    formError.value = '请填写 MODEL、BASE_URL 和 NAME'
    return
  }
  if (!props.model && !form.api_key.trim()) {
    formError.value = '请填写 API_KEY'
    return
  }
  saving.value = true
  try {
    if (props.model) {
      await models.editCustomModel(props.model.id, {
        name: form.name,
        api_key: form.api_key || undefined,
        base_url: form.base_url,
        model: form.model,
      })
    } else {
      await models.addCustomModel({ ...form })
    }
    emit('update:modelValue', false)
  } catch (error) {
    formError.value = parseApiError(error).message
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (!props.model || busy.value || !window.confirm(`确定删除「${props.model.name}」吗？`)) return
  deleting.value = true
  formError.value = ''
  try {
    await models.removeCustomModel(props.model.id)
    emit('update:modelValue', false)
  } catch (error) {
    formError.value = parseApiError(error).message
  } finally {
    deleting.value = false
  }
}
</script>

<style scoped>
.model-overlay {
  position: fixed;
  inset: 0;
  z-index: 400;
  display: grid;
  place-items: center;
  padding: 16px;
  background: var(--overlay-medium);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}
.model-dialog {
  width: min(480px, 100%);
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: var(--shadow-modal-sm);
}
.model-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px;
  border-bottom: 1px solid var(--line);
}
.model-header h2 {
  margin: 0;
  color: var(--ink);
  font-size: 16px;
}
.close-button {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ink-3);
  cursor: pointer;
  font-size: 20px;
}
.close-button:hover {
  background: var(--bg-2);
  color: var(--ink);
}
.model-form {
  display: grid;
  gap: 14px;
  padding: 20px 22px 22px;
}
.model-form label {
  display: grid;
  gap: 6px;
  color: var(--ink-2);
  font-size: 12px;
}
.model-form input {
  min-width: 0;
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 9px 10px;
  background: var(--bg-2);
  color: var(--ink);
  font: inherit;
  font-size: 13px;
}
.model-form input:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 1px;
}
.key-note {
  margin: 0;
  color: var(--ink-3);
  font-size: 11px;
}
.error-message {
  margin: 0;
  color: var(--danger, #c04b4b);
  font-size: 12px;
}
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}
.form-actions button {
  min-width: 74px;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 8px 12px;
  background: var(--surface);
  color: var(--ink-2);
  cursor: pointer;
  font-size: 12px;
}
.form-actions .primary-button {
  border-color: var(--blue);
  background: var(--blue);
  color: var(--on-accent);
}
.form-actions .delete-button {
  margin-right: auto;
  color: var(--danger, #c04b4b);
}
.form-actions button:disabled {
  cursor: wait;
  opacity: 0.6;
}
</style>
