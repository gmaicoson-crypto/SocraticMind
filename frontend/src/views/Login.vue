<template>
  <div class="login-page">
    <div class="login-shell">

      <!-- 左侧品牌区 -->
      <div class="brand">
        <div class="brand-logo">
          <div class="brand-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round">
              <circle cx="12" cy="6" r="2.5" fill="white" stroke="none"/>
              <circle cx="6" cy="16" r="2" fill="white" stroke="none"/>
              <circle cx="18" cy="16" r="2" fill="white" stroke="none"/>
              <path d="M12 8L6 14M12 8L18 14M8 16H16"/>
            </svg>
          </div>
          <div>
            <div class="brand-name">Socratic<span>Mind</span></div>
            <div class="brand-tagline">AI Guided Learning</div>
          </div>
        </div>

        <div class="brand-hero">
          <div class="brand-headline">
            不给答案，<br/>只给你<em>思考的路</em>
          </div>
          <div class="brand-desc">
            通过苏格拉底式引导，AI 帮你主动发现知识，而不是被动接受。每一个问题都是通往掌握的一步。
          </div>

          <div class="features">
            <div v-for="feat in features" :key="feat.title" class="feat">
              <div class="feat-icon">
                <component :is="feat.icon" />
              </div>
              <div class="feat-text">
                <strong>{{ feat.title }}</strong>
                {{ feat.desc }}
              </div>
            </div>
          </div>
        </div>

        <div class="brand-footer">© 2026 SocraticMind · 让学习真正发生</div>
      </div>

      <!-- 右侧表单区 -->
      <div class="form-area">

        <!-- 标签切换 -->
        <div class="form-tabs">
          <button
            class="ftab"
            :class="{ active: mode === 'login' }"
            @click="mode = 'login'"
          >登录</button>
          <button
            class="ftab"
            :class="{ active: mode === 'register' }"
            @click="mode = 'register'"
          >注册</button>
        </div>

        <!-- 标题 -->
        <div class="form-header">
          <div class="form-title">{{ mode === 'login' ? '欢迎回来' : '创建账号' }}</div>
          <div class="form-sub">{{ mode === 'login' ? '继续你的学习旅程 ✦' : '开始你的苏格拉底式学习之旅' }}</div>
        </div>

        <!-- 表单 -->
        <div class="form-body">

          <!-- 注册额外字段 -->
          <div v-if="mode === 'register'" class="field">
            <label>用户名</label>
            <div class="field-input" :class="{ focused: focusField === 'name' }">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
              <input
                v-model="form.name"
                type="text"
                placeholder="你的昵称"
                @focus="focusField = 'name'"
                @blur="focusField = ''"
              />
            </div>
          </div>

          <!-- 邮箱 -->
          <div class="field">
            <label>邮箱地址</label>
            <div class="field-input" :class="{ focused: focusField === 'email' }">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              <input
                v-model="form.email"
                type="email"
                placeholder="your@email.com"
                @focus="focusField = 'email'"
                @blur="focusField = ''"
              />
            </div>
          </div>

          <!-- 验证码（注册） -->
          <div v-if="mode === 'register'" class="field">
            <label>邮箱验证码</label>
            <div class="code-row">
              <div class="field-input" :class="{ focused: focusField === 'code' }">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 1l3 6 6 .9-4.5 4.4 1 6.7L12 16l-5.5 3 1-6.7L3 7.9 9 7z"/>
                </svg>
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
              <button
                class="code-send-btn"
                :disabled="!canSendCode || sendingCode"
                @click="onSendCode"
              >
                <span v-if="sendingCode">发送中</span>
                <span v-else-if="codeCooldown > 0">{{ codeCooldown }}s</span>
                <span v-else>发送验证码</span>
              </button>
            </div>
            <div v-if="codeMsg" class="field-success">{{ codeMsg }}</div>
          </div>

          <!-- 密码 -->
          <div class="field">
            <label>密码</label>
            <div class="field-input" :class="{ focused: focusField === 'password' }">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <input
                v-model="form.password"
                :type="showPwd ? 'text' : 'password'"
                placeholder="输入密码"
                @focus="focusField = 'password'"
                @blur="focusField = ''"
              />
              <button class="pwd-toggle" @click="showPwd = !showPwd">
                <svg v-if="!showPwd" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
                <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              </button>
            </div>
            <!-- 密码强度条（注册时显示） -->
            <div v-if="mode === 'register'" class="strength-wrap">
              <div class="strength-bar">
                <div class="strength-fill" :style="{ width: strengthPct + '%', background: strengthColor }" />
              </div>
              <span class="strength-label" :style="{ color: strengthColor }">{{ strengthLabel }}</span>
            </div>
          </div>

          <!-- 确认密码（注册） -->
          <div v-if="mode === 'register'" class="field">
            <label>确认密码</label>
            <div class="field-input" :class="{ focused: focusField === 'confirm' }">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
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

          <!-- 记住我 / 忘记密码 -->
          <div v-if="mode === 'login'" class="field-row">
            <label class="remember">
              <input v-model="form.remember" type="checkbox" /> 记住我
            </label>
            <a class="forgot" @click="showForgot = true">忘记密码？</a>
          </div>

          <!-- 服务条款（注册） -->
          <div v-if="mode === 'register'" class="terms">
            <input v-model="form.agreed" type="checkbox" />
            <span>
              我已阅读并同意
              <a @click.prevent="openLegal('terms')">服务条款</a>
              与
              <a @click.prevent="openLegal('privacy')">隐私政策</a>
            </span>
          </div>

          <!-- 错误提示 -->
          <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>

          <!-- 提交按钮 -->
          <button class="submit-btn" :disabled="submitting" @click="handleSubmit">
            <span v-if="submitting" class="spinner" />
            <template v-else>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round">
                <path v-if="mode === 'login'" d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>
                <path v-else d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle v-if="mode === 'register'" cx="9" cy="7" r="4"/><line v-if="mode === 'register'" x1="19" y1="8" x2="19" y2="14"/><line v-if="mode === 'register'" x1="22" y1="11" x2="16" y2="11"/>
              </svg>
              {{ mode === 'login' ? '登录' : '创建账号' }}
            </template>
          </button>

          <!-- 安全提示 -->
          <div class="security-hint">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span>{{ mode === 'register' ? '注册需邮箱验证码，10 分钟内有效' : '连续 5 次登录失败将临时锁定账号' }}</span>
          </div>
        </div>

        <div class="form-footer">
          <template v-if="mode === 'login'">
            还没有账号？<a @click="mode = 'register'">立即注册</a>
          </template>
          <template v-else>
            已有账号？<a @click="mode = 'login'">立即登录</a>
          </template>
        </div>

      </div>
    </div>

    <!-- 弹窗 -->
    <ForgotPasswordModal :show="showForgot" @close="showForgot = false" />
    <LegalModal :show="showLegal" :kind="legalKind" @close="showLegal = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, h, onBeforeUnmount, defineAsyncComponent } from 'vue'
import { useRouter } from 'vue-router'
import { login, register, sendVerificationCode } from '../api/auth'
import { useLearningStore } from '../stores/learning'

const ForgotPasswordModal = defineAsyncComponent(() => import('../components/ForgotPasswordModal.vue'))
const LegalModal = defineAsyncComponent(() => import('../components/LegalModal.vue'))

const router = useRouter()
const mode = ref<'login' | 'register'>('login')
const focusField = ref('')
const showPwd = ref(false)
const submitting = ref(false)
const errorMsg = ref('')

const store = useLearningStore()

const form = ref({
  name: '',
  email: '',
  password: '',
  confirm: '',
  code: '',
  remember: false,
  agreed: false,
})

// 验证码发送态：组件卸载需清理 cooldown 计时器，避免组件销毁后还在 tick 报警告
const sendingCode = ref(false)
const codeCooldown = ref(0)
const codeMsg = ref('')
let cooldownTimer: number | null = null

// 弹窗
const showForgot = ref(false)
const legalKind = ref<'terms' | 'privacy'>('terms')
const showLegal = ref(false)
function openLegal(kind: 'terms' | 'privacy') {
  legalKind.value = kind
  showLegal.value = true
}

const emailValid = computed(() =>
  /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/.test(form.value.email.trim())
)
const canSendCode = computed(() => emailValid.value && codeCooldown.value === 0 && !sendingCode.value)

function startCooldown() {
  codeCooldown.value = 60
  cooldownTimer = window.setInterval(() => {
    codeCooldown.value -= 1
    if (codeCooldown.value <= 0 && cooldownTimer !== null) {
      clearInterval(cooldownTimer)
      cooldownTimer = null
    }
  }, 1000)
}

async function onSendCode() {
  errorMsg.value = ''
  codeMsg.value = ''
  if (!emailValid.value) { errorMsg.value = '请先填写正确的邮箱'; return }
  sendingCode.value = true
  try {
    await sendVerificationCode(form.value.email.trim().toLowerCase(), 'register')
    codeMsg.value = '验证码已发送，10 分钟内有效'
    startCooldown()
  } catch (err: any) {
    errorMsg.value = err.response?.data?.detail || '验证码发送失败'
  } finally {
    sendingCode.value = false
  }
}

onBeforeUnmount(() => {
  if (cooldownTimer !== null) clearInterval(cooldownTimer)
})

// 密码强度
const strengthPct = computed(() => {
  const p = form.value.password
  if (!p) return 0
  let score = 0
  if (p.length >= 8) score += 25
  if (p.length >= 12) score += 25
  if (/[A-Z]/.test(p)) score += 25
  if (/[0-9!@#$%]/.test(p)) score += 25
  return score
})

const strengthColor = computed(() => {
  if (strengthPct.value <= 25) return '#E24B4A'
  if (strengthPct.value <= 50) return '#EF9F27'
  if (strengthPct.value <= 75) return '#5BA3D9'
  return '#1D9E75'
})

const strengthLabel = computed(() => {
  if (strengthPct.value <= 25) return '弱'
  if (strengthPct.value <= 50) return '一般'
  if (strengthPct.value <= 75) return '较强'
  return '强'
})

async function handleSubmit() {
  errorMsg.value = ''

  if (!form.value.email || !form.value.password) {
    errorMsg.value = '请填写邮箱和密码'
    return
  }

  if (mode.value === 'register') {
    if (!form.value.name) { errorMsg.value = '请填写用户名'; return }
    if (form.value.password.length < 8) { errorMsg.value = '密码至少 8 位'; return }
    if (!/[A-Za-z]/.test(form.value.password) || !/\d/.test(form.value.password)) {
      errorMsg.value = '密码必须同时包含字母和数字'; return
    }
    if (form.value.password !== form.value.confirm) { errorMsg.value = '两次密码不一致'; return }
    if (!form.value.code || form.value.code.trim().length !== 6) {
      errorMsg.value = '请填写 6 位邮箱验证码'; return
    }
    if (!form.value.agreed) { errorMsg.value = '请阅读并同意服务条款与隐私政策'; return }
  }

  submitting.value = true
  try {
    let result
    if (mode.value === 'login') {
      result = await login({ email: form.value.email, password: form.value.password })
    } else {
      result = await register({
        username: form.value.name,
        email: form.value.email.trim().toLowerCase(),
        password: form.value.password,
        code: form.value.code.trim(),
      })
    }
    // 保存 token 和用户信息
    localStorage.setItem('sm_token', result.access_token)
    localStorage.setItem('sm_logged_in', 'true')
    localStorage.setItem('sm_user', JSON.stringify(result.user))
    store.setUserInfo(result.user)
    await store.fetchTopics()
    await store.fetchStreak()
    router.push('/')
  } catch (err: any) {
    errorMsg.value = err.response?.data?.detail || '操作失败，请重试'
  } finally {
    submitting.value = false
  }
}

// 特性列表图标
const features = [
  {
    title: '苏格拉底式 AI 对话',
    desc: '引导提问，不直接给答案，激发真正的理解',
    icon: () => h('svg', { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: '#2E7FBB', 'stroke-width': 2 }, [
      h('path', { d: 'M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5Z', fill: '#EBF4FD' })
    ]),
  },
  {
    title: '动态知识图谱',
    desc: '可视化学习路径，节点状态实时联动',
    icon: () => h('svg', { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: '#2E7FBB', 'stroke-width': 2, 'stroke-linecap': 'round' }, [
      h('circle', { cx: 12, cy: 5, r: 2 }),
      h('circle', { cx: 5, cy: 19, r: 2 }),
      h('circle', { cx: 19, cy: 19, r: 2 }),
      h('path', { d: 'M12 7v4M12 11L5 17M12 11L19 17' }),
    ]),
  },
  {
    title: '笔记与画布',
    desc: 'Markdown 笔记 + 手绘画板，随时记录灵感',
    icon: () => h('svg', { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: '#2E7FBB', 'stroke-width': 2, 'stroke-linecap': 'round' }, [
      h('path', { d: 'M4 6H20M4 12H20M4 18H14' })
    ]),
  },
]
</script>

<style scoped>
.login-page {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg);
  padding: 24px;
}

.login-shell {
  width: 100%;
  max-width: 960px;
  min-height: 600px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 8px 40px oklch(0.5 0.04 235 / 0.1);
}

/* ── 左侧品牌 ── */
.brand {
  background: var(--bg-2);
  border-right: 1px solid var(--line);
  padding: 44px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.brand-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 44px;
}

.brand-icon {
  width: 36px; height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--blue), var(--blue-2));
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px oklch(0.72 0.085 235 / 0.3);
}

.brand-name {
  font-size: 18px;
  font-weight: 700;
  color: var(--ink);
  letter-spacing: -0.01em;
}
.brand-name span { color: var(--blue-2); }

.brand-tagline {
  font-size: 9.5px;
  color: var(--ink-3);
  font-family: var(--font-mono);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-top: 1px;
}

.brand-hero {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.brand-headline {
  font-size: 26px;
  font-weight: 700;
  color: var(--ink);
  line-height: 1.3;
  letter-spacing: -0.02em;
  margin-bottom: 12px;
}
.brand-headline em {
  color: var(--blue-2);
  font-style: normal;
}

.brand-desc {
  font-size: 13px;
  color: var(--ink-2);
  line-height: 1.7;
  margin-bottom: 32px;
}

.features {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.feat {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.feat-icon {
  width: 32px; height: 32px;
  border-radius: 8px;
  background: var(--blue-tint);
  border: 0.5px solid var(--blue-line);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.feat-text {
  font-size: 12px;
  color: var(--ink-2);
  line-height: 1.5;
}
.feat-text strong {
  color: var(--ink);
  font-weight: 600;
  display: block;
  margin-bottom: 1px;
  font-size: 12.5px;
}

.brand-footer {
  font-size: 11px;
  color: var(--ink-3);
}

/* ── 右侧表单 ── */
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
  transition: all .15s;
}

.ftab.active {
  background: var(--surface);
  color: var(--ink);
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}

.form-header { }

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

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.field label {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--ink-2);
}

.field-input {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 9px;
  padding: 0 12px;
  height: 42px;
  transition: all .15s;
}

.field-input.focused {
  border-color: var(--blue);
  background: var(--surface);
  box-shadow: 0 0 0 3px oklch(0.72 0.085 235 / 0.12);
}

.field-input svg { opacity: 0.4; flex-shrink: 0; }

.field-input input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  color: var(--ink);
  font-family: var(--font-sans);
}

.field-input input::placeholder { color: var(--ink-3); }

.pwd-toggle {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--ink-3);
  padding: 0;
  display: flex;
  align-items: center;
}
.pwd-toggle:hover { color: var(--ink-2); }

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
  transition: width .3s, background .3s;
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
.remember input { accent-color: var(--blue-2); }

.forgot {
  font-size: 12px;
  color: var(--blue-2);
  cursor: pointer;
}
.forgot:hover { text-decoration: underline; }

.terms {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  font-size: 11.5px;
  color: var(--ink-2);
}
.terms input { accent-color: var(--blue-2); margin-top: 2px; flex-shrink: 0; }
.terms a { color: var(--blue-2); cursor: pointer; }

.field-error {
  font-size: 11px;
  color: #E24B4A;
  font-family: var(--font-mono);
}

.error-msg {
  padding: 8px 12px;
  background: #FCEBEB;
  border: 1px solid #F7C1C1;
  border-radius: 8px;
  font-size: 12px;
  color: #A32D2D;
}

.submit-btn {
  height: 44px;
  border-radius: 10px;
  border: none;
  background: linear-gradient(135deg, var(--blue), var(--blue-2));
  color: white;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-family: var(--font-sans);
  transition: opacity .15s;
}

.submit-btn:hover:not(:disabled) { opacity: 0.88; }
.submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.spinner {
  width: 16px; height: 16px;
  border: 2px solid rgba(255,255,255,0.4);
  border-top-color: white;
  border-radius: 50%;
  animation: spin .7s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

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

.code-row { display: flex; gap: 8px; align-items: stretch; }
.code-row .field-input { flex: 1; min-width: 0; }
.code-send-btn {
  flex-shrink: 0;
  height: 42px; padding: 0 14px;
  border: 1px solid var(--blue-line); border-radius: 9px;
  background: var(--surface); color: var(--blue-2);
  font-size: 12px; font-weight: 600; cursor: pointer;
  font-family: var(--font-sans);
  white-space: nowrap;
  transition: all .15s;
}
.code-send-btn:hover:not(:disabled) { background: var(--blue-tint); }
.code-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.field-success {
  font-size: 11px;
  color: #1F6F4A;
  font-family: var(--font-mono);
}

.security-hint {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 10px;
  background: var(--blue-tint);
  border: 1px solid var(--blue-line);
  border-radius: 8px;
  font-size: 11px;
  color: var(--ink-2);
  line-height: 1.5;
}
.security-hint svg { color: var(--blue-2); flex-shrink: 0; }

.social-btns { display: flex; gap: 8px; }

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
  transition: background .15s;
}
.social-btn:hover { background: var(--bg-2); }

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
.form-footer a:hover { text-decoration: underline; }
</style>