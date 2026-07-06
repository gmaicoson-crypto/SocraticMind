<template>
  <BaseModal :model-value="show" :close-disabled="submitting" @close="onClose">
      <div class="fp-overlay" @click.self="onClose">
        <div class="fp-modal">
          <div class="fp-header">
            <div class="fp-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              重置密码
            </div>
            <button class="fp-close ui-modal-close" @click="onClose">✕</button>
          </div>

          <div class="fp-body">
            <div class="fp-step-hint">输入注册邮箱 → 接收验证码 → 设置新密码</div>

            <div class="fp-field ui-field">
              <label>邮箱地址</label>
              <input
                v-model="email"
                type="email"
                placeholder="your@email.com"
                :disabled="submitting"
              />
            </div>

            <div class="fp-field ui-field">
              <label>验证码</label>
              <div class="fp-code-row">
                <input
                  v-model="code"
                  type="text"
                  inputmode="numeric"
                  maxlength="6"
                  placeholder="6 位数字"
                  :disabled="submitting"
                />
                <button
                  class="fp-send-btn"
                  :disabled="!canSend || sending"
                  @click="onSendCode"
                >
                  <span v-if="sending">发送中…</span>
                  <span v-else-if="cooldown > 0">{{ cooldown }}s 后重发</span>
                  <span v-else>发送验证码</span>
                </button>
              </div>
            </div>

            <div class="fp-field ui-field">
              <label>新密码</label>
              <input
                v-model="newPassword"
                type="password"
                placeholder="至少 8 位，包含字母和数字"
                :disabled="submitting"
              />
            </div>

            <div class="fp-field ui-field">
              <label>确认新密码</label>
              <input
                v-model="confirm"
                type="password"
                placeholder="再次输入新密码"
                :disabled="submitting"
              />
            </div>

            <div v-if="errorMsg" class="fp-error ui-error-message">{{ errorMsg }}</div>
            <div v-if="successMsg" class="fp-success">{{ successMsg }}</div>

            <button class="fp-submit" :disabled="!canSubmit || submitting" @click="onSubmit">
              <span v-if="submitting">提交中…</span>
              <span v-else>重置密码</span>
            </button>
          </div>
        </div>
      </div>
  </BaseModal>
</template>

<script setup lang="ts">
// ForgotPasswordModal 组件，封装局部界面和交互逻辑。
import { ref, computed, onBeforeUnmount, watch } from 'vue'
import { sendVerificationCode, resetPassword } from '../../api/auth'
import BaseModal from '../ui/BaseModal.vue'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const email = ref('')
const code = ref('')
const newPassword = ref('')
const confirm = ref('')
const sending = ref(false)
const submitting = ref(false)
const errorMsg = ref('')
const successMsg = ref('')

const cooldown = ref(0)
let cooldownTimer: number | null = null

function startCooldown() {
  cooldown.value = 60
  cooldownTimer = window.setInterval(() => {
    cooldown.value -= 1
    if (cooldown.value <= 0 && cooldownTimer !== null) {
      clearInterval(cooldownTimer)
      cooldownTimer = null
    }
  }, 1000)
}

const emailValid = computed(() => /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/.test(email.value.trim()))
const canSend = computed(() => emailValid.value && cooldown.value === 0 && !sending.value)
const canSubmit = computed(() =>
  emailValid.value &&
  code.value.trim().length === 6 &&
  newPassword.value.length >= 8 &&
  newPassword.value === confirm.value
)

async function onSendCode() {
  errorMsg.value = ''
  successMsg.value = ''
  if (!emailValid.value) { errorMsg.value = '邮箱格式不正确'; return }
  sending.value = true
  try {
    await sendVerificationCode(email.value.trim().toLowerCase(), 'reset')
    successMsg.value = '验证码已发送，请查收邮箱'
    startCooldown()
  } catch (err: any) {
    errorMsg.value = err.response?.data?.detail || '发送失败，请稍后重试'
  } finally {
    sending.value = false
  }
}

async function onSubmit() {
  errorMsg.value = ''
  successMsg.value = ''
  if (newPassword.value !== confirm.value) { errorMsg.value = '两次密码不一致'; return }
  if (!/[A-Za-z]/.test(newPassword.value) || !/\d/.test(newPassword.value)) {
    errorMsg.value = '密码必须同时包含字母和数字'
    return
  }
  submitting.value = true
  try {
    await resetPassword(email.value.trim().toLowerCase(), code.value.trim(), newPassword.value)
    successMsg.value = '密码已重置，请用新密码登录'
    setTimeout(() => onClose(), 1200)
  } catch (err: any) {
    errorMsg.value = err.response?.data?.detail || '重置失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}

function onClose() {
  email.value = ''
  code.value = ''
  newPassword.value = ''
  confirm.value = ''
  errorMsg.value = ''
  successMsg.value = ''
  emit('close')
}

watch(() => props.show, (v) => {
  if (!v && cooldownTimer !== null) {
    clearInterval(cooldownTimer)
    cooldownTimer = null
    cooldown.value = 0
  }
})

onBeforeUnmount(() => {
  if (cooldownTimer !== null) clearInterval(cooldownTimer)
})
</script>

<style scoped>
.fp-overlay {
  position: fixed;
  inset: 0;
  z-index: 340;
  background: rgba(0,0,0,0.36);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.fp-modal {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
  width: min(440px, 100%);
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 48px rgba(0,0,0,0.18);
  overflow: hidden;
}
.fp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--line);
}
.fp-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
}
.fp-title svg {
  color: var(--blue-2);
}
.fp-body {
  padding: 18px 22px 22px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.fp-step-hint {
  font-size: 11.5px;
  color: var(--ink-3);
  padding: 8px 10px;
  background: var(--blue-tint);
  border: 1px solid var(--blue-line);
  border-radius: 8px;
}

.fp-field input {
  height: 38px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--bg-2);
  color: var(--ink);
  font-size: 13px;
  font-family: var(--font-sans);
  outline: none;
  transition: border-color .15s, box-shadow .15s;
}
.fp-field input:focus {
  border-color: var(--blue);
  background: var(--surface);
  box-shadow: 0 0 0 3px oklch(0.72 0.085 235 / 0.12);
}

.fp-code-row {
  display: flex;
  gap: 8px;
}
.fp-code-row input {
  flex: 1;
}
.fp-send-btn {
  flex-shrink: 0;
  height: 38px;
  padding: 0 14px;
  border: 1px solid var(--blue-line);
  border-radius: 9px;
  background: var(--surface);
  color: var(--blue-2);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  font-family: var(--font-sans);
  white-space: nowrap;
  transition: all .15s;
}
.fp-send-btn:hover:not(:disabled) {
  background: var(--blue-tint);
}
.fp-send-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.fp-success {
  padding: 8px 12px;
  background: #E8F5EE;
  border: 1px solid #B6D9C6;
  border-radius: 8px;
  font-size: 12px;
  color: #1F6F4A;
}

.fp-submit {
  margin-top: 4px;
  height: 42px;
  border-radius: 10px;
  border: none;
  background: linear-gradient(135deg, var(--blue), var(--blue-2));
  color: white;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  font-family: var(--font-sans);
}
.fp-submit:hover:not(:disabled) {
  opacity: 0.9;
}
.fp-submit:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity .2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
