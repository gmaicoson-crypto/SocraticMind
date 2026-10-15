import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { login, register, sendVerificationCode } from '../api/auth'
import { parseApiError } from '../api'
import { useLearningStore } from '../stores/learning'
import { setAuth } from '../utils/token'

export function useAuthForm() {
  const router = useRouter()

  const mode = ref<'login' | 'register'>('login')

  const focusField = ref('')

  const showPwd = ref(false)

  const submitting = ref(false)

  const errorMsg = ref('')

  const store = useLearningStore()

  const blankForm = () => ({
    name: '',
    email: '',
    password: '',
    confirm: '',
    code: '',
    remember: false,
    agreed: false,
  })

  const form = ref(blankForm())

  watch(mode, () => {
    form.value = blankForm()
    errorMsg.value = ''
    codeMsg.value = ''
  })

  const sendingCode = ref(false)

  const codeCooldown = ref(0)

  const codeMsg = ref('')

  let cooldownTimer: number | null = null

  const showForgot = ref(false)

  const legalKind = ref<'terms' | 'privacy'>('terms')

  const showLegal = ref(false)

  function openLegal(kind: 'terms' | 'privacy') {
    legalKind.value = kind
    showLegal.value = true
  }

  const emailValid = computed(() =>
    /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/.test(form.value.email.trim()),
  )

  const canSendCode = computed(
    () => emailValid.value && codeCooldown.value === 0 && !sendingCode.value,
  )

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
    if (!emailValid.value) {
      errorMsg.value = '请先填写正确的邮箱'
      return
    }
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
    if (strengthPct.value <= 25) return 'var(--danger-button-text)'
    if (strengthPct.value <= 50) return 'var(--timeline-start)'
    if (strengthPct.value <= 75) return 'var(--blue)'
    return 'var(--timeline-chat)'
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
      if (!form.value.name) {
        errorMsg.value = '请填写用户名'
        return
      }
      if (form.value.password.length < 8) {
        errorMsg.value = '密码至少 8 位'
        return
      }
      if (!/[A-Za-z]/.test(form.value.password) || !/\d/.test(form.value.password)) {
        errorMsg.value = '密码必须同时包含字母和数字'
        return
      }
      if (form.value.password !== form.value.confirm) {
        errorMsg.value = '两次密码不一致'
        return
      }
      if (!form.value.code || form.value.code.trim().length !== 6) {
        errorMsg.value = '请填写 6 位邮箱验证码'
        return
      }
      if (!form.value.agreed) {
        errorMsg.value = '请阅读并同意服务条款与隐私政策'
        return
      }
    }

    submitting.value = true
    try {
      let result
      if (mode.value === 'login') {
        result = await login({
          email: form.value.email.trim().toLowerCase(),
          password: form.value.password,
        })
      } else {
        result = await register({
          username: form.value.name,
          email: form.value.email.trim().toLowerCase(),
          password: form.value.password,
          code: form.value.code.trim(),
        })
      }
      setAuth(result.access_token, result.user, form.value.remember)
      store.setUserInfo(result.user)
      await store.fetchTopics()
      await store.recordLearning()
      router.push('/')
    } catch (err: any) {
      errorMsg.value = parseApiError(err).message
    } finally {
      submitting.value = false
    }
  }

  return {
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
  }
}
