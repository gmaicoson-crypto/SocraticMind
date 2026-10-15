<template>
  <BaseModal :model-value="show" :close-disabled="submitting" @close="onClose">
    <div class="da-overlay" @click.self="onClose">
      <div class="da-modal">
        <div class="da-header">
          <div class="da-title">
            <TriangleAlert :size="14" class="icon-inherit" aria-hidden="true" />
            注销账号
          </div>
          <button class="da-close ui-modal-close" @click="onClose">✕</button>
        </div>

        <div class="da-body">
          <div class="da-warn">
            <strong>此操作不可撤销。</strong> 注销后我们将永久删除：
            <ul>
              <li>账号信息（用户名、邮箱、密码哈希、头像图片）</li>
              <li>全部学习主题与知识图谱节点</li>
              <li>所有 AI 对话记录与笔记</li>
              <li>连续学习记录与目标设置</li>
            </ul>
            数据一经删除无法恢复，请谨慎操作。
          </div>

          <div class="da-field ui-field">
            <label>登录密码</label>
            <input
              v-model="password"
              type="password"
              placeholder="输入当前密码以确认身份"
              autocomplete="current-password"
              :disabled="submitting"
            />
          </div>

          <div class="da-field ui-field">
            <label>请输入大写 <code>DELETE</code> 完成确认</label>
            <input
              v-model="confirm"
              type="text"
              placeholder="DELETE"
              :disabled="submitting"
              spellcheck="false"
              autocapitalize="characters"
            />
          </div>

          <div v-if="errorMsg" class="da-error ui-error-message">{{ errorMsg }}</div>

          <div class="da-actions">
            <button class="da-cancel" :disabled="submitting" @click="onClose">取消</button>
            <button class="da-submit" :disabled="!canSubmit || submitting" @click="onSubmit">
              <span v-if="submitting">注销中…</span>
              <span v-else>永久注销账号</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import { TriangleAlert } from '@lucide/vue'
// DeleteAccountModal 组件，封装局部界面和交互逻辑。
import { ref, computed, watch } from 'vue'
import BaseModal from '../ui/BaseModal.vue'

const props = defineProps<{ show: boolean; submitting?: boolean; errorMsg?: string }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', payload: { password: string; confirm: string }): void
}>()

const password = ref('')
const confirm = ref('')

const canSubmit = computed(
  () => password.value.length >= 1 && confirm.value.trim().toUpperCase() === 'DELETE',
)

function onSubmit() {
  emit('confirm', { password: password.value, confirm: confirm.value.trim().toUpperCase() })
}

function onClose() {
  if (props.submitting) return
  emit('close')
}

watch(
  () => props.show,
  (v) => {
    if (!v) {
      password.value = ''
      confirm.value = ''
    }
  },
)
</script>

<style scoped>
.da-overlay {
  position: fixed;
  inset: 0;
  z-index: 360;
  background: var(--overlay-strong);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.da-modal {
  background: var(--surface);
  border: 1px solid var(--danger-line);
  border-radius: 16px;
  width: min(440px, 100%);
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-modal-sm);
  overflow: hidden;
}
.da-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--line);
}
.da-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--danger-title);
}
.da-title svg {
  color: var(--danger-button-text);
}
.da-body {
  padding: 18px 22px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.da-warn {
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--danger-body);
  background: var(--danger-soft);
  border: 1px solid var(--danger-line);
  border-radius: 10px;
  padding: 12px 14px;
}
.da-warn strong {
  color: var(--danger-ink);
  font-weight: 700;
}
.da-warn ul {
  padding-left: 20px;
  margin: 6px 0 0;
}
.da-warn li {
  margin: 2px 0;
}

.da-field code {
  font-family: var(--font-mono);
  font-size: 11px;
  background: var(--bg-3);
  color: var(--ink);
  padding: 1px 5px;
  border-radius: 3px;
}
.da-field input {
  height: 38px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--bg-2);
  color: var(--ink);
  font-size: 13px;
  font-family: var(--font-sans);
  outline: none;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.da-field input:focus {
  border-color: var(--danger-button-text);
  background: var(--surface);
  box-shadow: 0 0 0 3px var(--danger-focus-ring);
}

.da-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}
.da-cancel {
  padding: 8px 16px;
  border-radius: 9px;
  background: transparent;
  border: 1px solid var(--line);
  color: var(--ink-2);
  font-size: 12.5px;
  cursor: pointer;
  font-family: var(--font-sans);
}
.da-cancel:hover:not(:disabled) {
  background: var(--bg-2);
}
.da-cancel:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.da-submit {
  padding: 8px 18px;
  border-radius: 9px;
  background: var(--danger-gradient);
  border: none;
  color: var(--on-accent);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  font-family: var(--font-sans);
}
.da-submit:hover:not(:disabled) {
  opacity: 0.9;
}
.da-submit:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
