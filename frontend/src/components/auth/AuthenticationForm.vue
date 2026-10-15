<template>
  <div class="form-area">
    <div class="form-tabs">
      <button class="ftab" :class="{ active: mode === 'login' }" @click="mode = 'login'">
        登录
      </button>
      <button class="ftab" :class="{ active: mode === 'register' }" @click="mode = 'register'">
        注册
      </button>
    </div>

    <div class="form-header">
      <div class="form-title">{{ mode === 'login' ? '欢迎回来' : '创建账号' }}</div>
      <div class="form-sub">
        {{ mode === 'login' ? '继续你的学习旅程 ✦' : '开始你的苏格拉底式学习之旅' }}
      </div>
    </div>

    <div class="form-body">
      <div v-if="mode === 'register'" class="field ui-field">
        <label>用户名</label>
        <div class="field-input" :class="{ focused: focusField === 'name' }">
          <UserRound :size="14" aria-hidden="true" />
          <input
            v-model="form.name"
            type="text"
            placeholder="你的昵称"
            @focus="focusField = 'name'"
            @blur="focusField = ''"
          />
        </div>
      </div>

      <div class="field ui-field">
        <label>邮箱地址</label>
        <div class="field-input" :class="{ focused: focusField === 'email' }">
          <Mail :size="14" aria-hidden="true" />
          <input
            v-model="form.email"
            type="email"
            placeholder="your@email.com"
            @focus="focusField = 'email'"
            @blur="focusField = ''"
          />
        </div>
      </div>

      <div v-if="mode === 'register'" class="field ui-field">
        <label>邮箱验证码</label>
        <div class="code-row">
          <div class="field-input" :class="{ focused: focusField === 'code' }">
            <KeyRound :size="14" aria-hidden="true" />
            <input
              v-model="form.code"
              type="text"
              inputmode="numeric"
              maxlength="6"
              placeholder="6 位数字"
              @focus="focusField = 'code'"
              @blur="focusField = ''"
            />
          </div>
          <button class="code-send-btn" :disabled="!canSendCode || sendingCode" @click="onSendCode">
            <span v-if="sendingCode">发送中</span>
            <span v-else-if="codeCooldown > 0">{{ codeCooldown }}s</span>
            <span v-else>发送验证码</span>
          </button>
        </div>
        <div v-if="codeMsg" class="field-success">{{ codeMsg }}</div>
      </div>

      <div class="field ui-field">
        <label>密码</label>
        <div class="field-input" :class="{ focused: focusField === 'password' }">
          <LockKeyhole :size="14" aria-hidden="true" />
          <input
            v-model="form.password"
            :type="showPwd ? 'text' : 'password'"
            placeholder="输入密码"
            @focus="focusField = 'password'"
            @blur="focusField = ''"
          />
          <button class="pwd-toggle ui-icon-button" @click="showPwd = !showPwd">
            <Eye v-if="!showPwd" :size="13" aria-hidden="true" />
            <EyeOff v-else :size="13" aria-hidden="true" />
          </button>
        </div>
        <div v-if="mode === 'register'" class="strength-wrap">
          <div class="strength-bar">
            <div
              class="strength-fill"
              :style="{ width: strengthPct + '%', background: strengthColor }"
            />
          </div>
          <span class="strength-label" :style="{ color: strengthColor }">{{ strengthLabel }}</span>
        </div>
      </div>

      <div v-if="mode === 'register'" class="field ui-field">
        <label>确认密码</label>
        <div class="field-input" :class="{ focused: focusField === 'confirm' }">
          <LockKeyhole :size="14" aria-hidden="true" />
          <input
            v-model="form.confirm"
            type="password"
            placeholder="再次输入密码"
            @focus="focusField = 'confirm'"
            @blur="focusField = ''"
          />
        </div>
        <div v-if="form.confirm && form.confirm !== form.password" class="field-error">
          两次密码不一致
        </div>
      </div>

      <div v-if="mode === 'login'" class="field-row">
        <label class="remember"> <input v-model="form.remember" type="checkbox" /> 记住我 </label>
        <a class="forgot" @click="showForgot = true">忘记密码？</a>
      </div>

      <div v-if="mode === 'register'" class="terms">
        <input v-model="form.agreed" type="checkbox" />
        <span>
          我已阅读并同意
          <a @click.prevent="openLegal('terms')">服务条款</a>
          与
          <a @click.prevent="openLegal('privacy')">隐私政策</a>
        </span>
      </div>

      <div v-if="errorMsg" class="error-msg ui-error-message">{{ errorMsg }}</div>

      <button class="submit-btn" :disabled="submitting" @click="handleSubmit">
        <span v-if="submitting" class="spinner" />
        <template v-else>
          <component
            :is="mode === 'login' ? LogIn : UserRoundPlus"
            :size="14"
            class="icon-inherit"
            aria-hidden="true"
          />
          {{ mode === 'login' ? '登录' : '创建账号' }}
        </template>
      </button>

      <div class="security-hint">
        <ShieldCheck :size="11" aria-hidden="true" />
        <span>{{
          mode === 'register'
            ? '注册需邮箱验证码，10 分钟内有效'
            : '连续 5 次登录失败将临时锁定账号'
        }}</span>
      </div>
    </div>

    <div class="form-footer">
      <template v-if="mode === 'login'">
        还没有账号？<a @click="mode = 'register'">立即注册</a>
      </template>
      <template v-else> 已有账号？<a @click="mode = 'login'">立即登录</a> </template>
    </div>
  </div>
  <ForgotPasswordModal :show="showForgot" @close="showForgot = false" />
  <LegalModal :show="showLegal" :kind="legalKind" @close="showLegal = false" />
</template>
<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import {
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  LogIn,
  Mail,
  ShieldCheck,
  UserRound,
  UserRoundPlus,
} from '@lucide/vue'
import { useAuthForm } from '../../composables/useAuthForm'
const ForgotPasswordModal = defineAsyncComponent(() => import('./ForgotPasswordModal.vue'))
const LegalModal = defineAsyncComponent(() => import('./LegalModal.vue'))
const {
  mode,
  focusField,
  showPwd,
  submitting,
  errorMsg,
  form,
  sendingCode,
  codeCooldown,
  codeMsg,
  showForgot,
  legalKind,
  showLegal,
  openLegal,
  canSendCode,
  onSendCode,
  strengthPct,
  strengthColor,
  strengthLabel,
  handleSubmit,
} = useAuthForm()
</script>
<style scoped>
.form-area {
  padding: 44px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 20px;
}

.form-tabs {
  display: flex;
  gap: 0;
  background: var(--bg-2);
  border-radius: 10px;
  padding: 3px;
}

.ftab {
  flex: 1;
  padding: 8px;
  font-size: 13px;
  font-weight: 500;
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  color: var(--ink-2);
  font-family: var(--font-sans);
  transition: all 0.15s;
}

.ftab.active {
  background: var(--surface);
  color: var(--ink);
  box-shadow: var(--control-shadow);
}

.form-header {
}

.form-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--ink);
  letter-spacing: -0.01em;
  margin-bottom: 4px;
}

.form-sub {
  font-size: 12.5px;
  color: var(--ink-3);
}

.form-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.field-input {
  height: 42px;
  transition: all 0.15s;
}

.field-input input::placeholder {
  color: var(--ink-3);
}

.pwd-toggle {
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
}

.strength-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
}

.strength-bar {
  flex: 1;
  height: 3px;
  border-radius: 2px;
  background: var(--line);
  overflow: hidden;
}

.strength-fill {
  height: 100%;
  border-radius: 2px;
  transition:
    width 0.3s,
    background 0.3s;
}

.strength-label {
  font-size: 10.5px;
  font-weight: 600;
  font-family: var(--font-mono);
  min-width: 20px;
}

.field-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.remember {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--ink-2);
  cursor: pointer;
}
.remember input {
  accent-color: var(--blue-2);
}

.forgot {
  font-size: 12px;
  color: var(--blue-2);
  cursor: pointer;
}
.forgot:hover {
  text-decoration: underline;
}

.terms {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  font-size: 11.5px;
  color: var(--ink-2);
}
.terms input {
  accent-color: var(--blue-2);
  margin-top: 2px;
  flex-shrink: 0;
}
.terms a {
  color: var(--blue-2);
  cursor: pointer;
}

.field-error {
  font-size: 11px;
  color: var(--danger-button-text);
  font-family: var(--font-mono);
}

.submit-btn {
  height: 44px;
  border-radius: 10px;
  border: none;
  background: var(--accent-gradient);
  color: var(--on-accent);
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-family: var(--font-sans);
  transition: opacity 0.15s;
}

.submit-btn:hover:not(:disabled) {
  opacity: 0.88;
}
.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--spinner-track);
  border-top-color: var(--spinner-head);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.divider-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  color: var(--ink-3);
}
.divider-row::before,
.divider-row::after {
  content: '';
  flex: 1;
  height: 0.5px;
  background: var(--line);
}

.code-row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}
.code-row .field-input {
  flex: 1;
  min-width: 0;
}
.code-send-btn {
  flex-shrink: 0;
  height: 42px;
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
  transition: all 0.15s;
}
.code-send-btn:hover:not(:disabled) {
  background: var(--blue-tint);
}
.code-send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.field-success {
  font-size: 11px;
  color: var(--success-ink);
  font-family: var(--font-mono);
}

.security-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  background: var(--blue-tint);
  border: 1px solid var(--blue-line);
  border-radius: 8px;
  font-size: 11px;
  color: var(--ink-2);
  line-height: 1.5;
}
.security-hint svg {
  flex-shrink: 0;
}

.social-btns {
  display: flex;
  gap: 8px;
}

.social-btn {
  flex: 1;
  height: 38px;
  border-radius: 9px;
  border: 1px solid var(--line);
  background: var(--surface);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  font-size: 12px;
  font-weight: 500;
  color: var(--ink-2);
  cursor: pointer;
  font-family: var(--font-sans);
  transition: background 0.15s;
}
.social-btn:hover {
  background: var(--bg-2);
}

.form-footer {
  text-align: center;
  font-size: 12px;
  color: var(--ink-3);
}
.form-footer a {
  color: var(--blue-2);
  cursor: pointer;
  font-weight: 500;
}
.form-footer a:hover {
  text-decoration: underline;
}
</style>
