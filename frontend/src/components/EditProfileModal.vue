<template>
  <Teleport to="body">
    <div class="overlay" @click.self="emit('close')">
      <div class="modal">

        <!-- 头部 -->
        <div class="modal-header">
          <div>
            <div class="modal-title">编辑个人资料</div>
            <div class="modal-sub">更新你的个人信息</div>
          </div>
          <button class="close-btn" @click="emit('close')">✕</button>
        </div>

        <div class="modal-body">

          <!-- 基本信息 -->
          <div>
            <div class="section-label">基本信息</div>
            <div class="avatar-row">
              <div
                class="big-avatar"
                :style="hasImage ? {} : { background: form.avatarGrad }"
                @click="triggerUpload"
              >
                <img v-if="hasImage" :src="avatarPreview" alt="avatar" class="avatar-img" decoding="async" />
                <template v-else>{{ form.name.slice(0,1) || '李' }}</template>
                <div class="avatar-edit">
                  <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round">
                    <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/>
                  </svg>
                </div>
              </div>
              <input
                ref="fileInput"
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                style="display:none"
                @change="onFileChange"
              />
              <div class="avatar-colors">
                <div class="avatar-actions">
                  <button class="avatar-action-btn" :disabled="uploading" @click="triggerUpload">
                    {{ uploading ? '上传中…' : '上传图片' }}
                  </button>
                  <button
                    class="avatar-action-btn ghost"
                    :disabled="uploading || !hasImage"
                    @click="handleResetAvatar"
                  >
                    使用默认
                  </button>
                </div>
                <div class="avatar-hint">{{ hasImage ? '已使用自定义图片' : '选择头像颜色' }}</div>
                <div class="color-swatches" :class="{ disabled: hasImage }">
                  <div
                    v-for="g in avatarGrads"
                    :key="g"
                    class="swatch"
                    :class="{ active: !hasImage && form.avatarGrad === g }"
                    :style="{ background: g }"
                    @click="hasImage ? null : (form.avatarGrad = g)"
                  />
                </div>
              </div>
            </div>

            <div class="fields">
              <div class="field">
                <label>用户名</label>
                <div class="field-input" :class="{ focused: focusField === 'name' }">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                  <input
                    v-model="form.name"
                    type="text"
                    maxlength="20"
                    @focus="focusField = 'name'"
                    @blur="focusField = ''"
                  />
                </div>
                <div class="char-count">{{ form.name.length }} / 20</div>
              </div>

              <div class="field">
                <label>个性签名</label>
                <div class="field-input" :class="{ focused: focusField === 'bio' }">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                  <input
                    v-model="form.bio"
                    type="text"
                    maxlength="50"
                    @focus="focusField = 'bio'"
                    @blur="focusField = ''"
                  />
                </div>
              </div>

              <div class="field">
                <label>邮箱地址</label>
                <div class="field-input readonly">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                  <input type="email" :value="form.email" disabled />
                </div>
              </div>
            </div>
          </div>

          <div class="modal-divider" />

          <!-- 账号安全 -->
          <div>
            <div class="section-label">账号安全</div>
            <div class="danger-list">
              <div class="danger-row">
                <div>
                  <div class="danger-info">修改密码</div>
                  <div class="danger-sub">建议使用至少 6 位的强密码</div>
                </div>
                <button class="danger-btn outline" @click="showPwdPanel = !showPwdPanel">
                  {{ showPwdPanel ? '收起' : '修改密码' }}
                </button>
              </div>

              <div v-if="showPwdPanel" class="pwd-panel">
                <div class="field">
                  <label>原密码</label>
                  <div class="field-input">
                    <input v-model="pwdForm.old" type="password" autocomplete="current-password" />
                  </div>
                </div>
                <div class="field">
                  <label>新密码</label>
                  <div class="field-input">
                    <input v-model="pwdForm.next" type="password" autocomplete="new-password" minlength="6" />
                  </div>
                </div>
                <div class="field">
                  <label>确认新密码</label>
                  <div class="field-input">
                    <input v-model="pwdForm.confirm" type="password" autocomplete="new-password" minlength="6" />
                  </div>
                </div>
                <div v-if="pwdMsg" class="pwd-msg" :class="{ ok: pwdMsgType === 'ok' }">{{ pwdMsg }}</div>
                <div class="pwd-actions">
                  <button class="cancel-btn" @click="cancelPwd">取消</button>
                  <button class="save-btn" :disabled="pwdSaving" @click="submitPassword">
                    {{ pwdSaving ? '提交中…' : '保存新密码' }}
                  </button>
                </div>
              </div>
              <div class="danger-row">
                <div>
                  <div class="danger-info">退出登录</div>
                  <div class="danger-sub">退出当前账号</div>
                </div>
                <button class="danger-btn red" @click="handleLogout">退出登录</button>
              </div>
            </div>
          </div>

        </div>

        <!-- 底部 -->
        <div class="modal-footer">
          <button class="cancel-btn" @click="emit('close')">取消</button>
          <button
            class="save-btn"
            :class="{ loading: saving, saved: savedDone }"
            :disabled="saving"
            @click="handleSave"
          >
            <div v-if="saving" class="spinner" />
            <svg v-else-if="savedDone" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
            <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <path d="M17 21v-8H7v8M7 3v5h8"/>
            </svg>
            {{ saving ? '保存中…' : savedDone ? '已保存' : '保存更改' }}
          </button>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useLearningStore } from '../stores/learning'
import { updateMe, uploadAvatar, resetAvatar, changePassword } from '../api/auth'
import { avatarSrc } from '../utils/avatar'
import { avatarGrads } from '../utils/avatarGrads'

const emit = defineEmits<{ close: [] }>()
const router = useRouter()

const focusField = ref('')
const saving = ref(false)
const savedDone = ref(false)

// 头像上传
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const localPreview = ref<string | null>(null) // 选完图片后的本地预览（dataURL）
const avatarUrl = ref<string | null>(null)    // 后端返回的相对路径

const hasImage = computed(() => !!(localPreview.value || avatarUrl.value))
const avatarPreview = computed(() => localPreview.value ?? avatarSrc(avatarUrl.value))

function triggerUpload() {
  fileInput.value?.click()
}

// FileReader 仅用作本地预览，真实文件通过 uploadAvatar 上传，后端返回的 url 才是持久来源
async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  // 立刻清空 input，否则连续选择同一张图不会触发 change 事件
  input.value = ''
  if (!file) return
  if (file.size > 5 * 1024 * 1024) {
    alert('图片大小不能超过 5MB')
    return
  }
  // 本地即时预览
  const reader = new FileReader()
  reader.onload = () => { localPreview.value = String(reader.result) }
  reader.readAsDataURL(file)

  uploading.value = true
  try {
    const updated = await uploadAvatar(file)
    avatarUrl.value = updated.avatar_url
    localPreview.value = null
    localStorage.setItem('sm_user', JSON.stringify(updated))
    store.setUserInfo(updated)
  } catch (err: any) {
    alert(err?.response?.data?.detail ?? '上传失败')
    localPreview.value = null
  } finally {
    uploading.value = false
  }
}

async function handleResetAvatar() {
  if (!hasImage.value) return
  uploading.value = true
  try {
    const updated = await resetAvatar()
    avatarUrl.value = null
    localPreview.value = null
    localStorage.setItem('sm_user', JSON.stringify(updated))
    store.setUserInfo(updated)
  } catch (err: any) {
    alert(err?.response?.data?.detail ?? '重置失败')
  } finally {
    uploading.value = false
  }
}

// 修改密码
const showPwdPanel = ref(false)
const pwdSaving = ref(false)
const pwdMsg = ref('')
const pwdMsgType = ref<'err' | 'ok'>('err')
const pwdForm = reactive({ old: '', next: '', confirm: '' })

function cancelPwd() {
  showPwdPanel.value = false
  pwdForm.old = ''
  pwdForm.next = ''
  pwdForm.confirm = ''
  pwdMsg.value = ''
}

async function submitPassword() {
  pwdMsg.value = ''
  if (!pwdForm.old || !pwdForm.next) {
    pwdMsg.value = '请填写完整'
    pwdMsgType.value = 'err'
    return
  }
  if (pwdForm.next.length < 6) {
    pwdMsg.value = '新密码至少 6 个字符'
    pwdMsgType.value = 'err'
    return
  }
  if (pwdForm.next !== pwdForm.confirm) {
    pwdMsg.value = '两次输入的新密码不一致'
    pwdMsgType.value = 'err'
    return
  }
  pwdSaving.value = true
  try {
    await changePassword(pwdForm.old, pwdForm.next)
    pwdMsg.value = '密码修改成功'
    pwdMsgType.value = 'ok'
    pwdForm.old = ''
    pwdForm.next = ''
    pwdForm.confirm = ''
    pwdHideTimer = setTimeout(() => { showPwdPanel.value = false; pwdMsg.value = '' }, 1200)
  } catch (err: any) {
    pwdMsg.value = err?.response?.data?.detail ?? '修改失败'
    pwdMsgType.value = 'err'
  } finally {
    pwdSaving.value = false
  }
}

// 持有定时器引用，保证组件提前关闭时不会回写已销毁的状态
let pwdHideTimer: ReturnType<typeof setTimeout> | null = null
let savedCloseTimer: ReturnType<typeof setTimeout> | null = null

onBeforeUnmount(() => {
  if (pwdHideTimer) clearTimeout(pwdHideTimer)
  if (savedCloseTimer) clearTimeout(savedCloseTimer)
})

const store = useLearningStore()

const form = reactive({
  name: store.userInfo?.username ?? '',
  bio: store.userInfo?.bio ?? '',
  email: store.userInfo?.email ?? '',
  avatarGrad: store.userInfo?.avatar_grad ?? avatarGrads[0],
})

avatarUrl.value = store.userInfo?.avatar_url ?? null

async function handleSave() {
  saving.value = true
  try {
    const updated = await updateMe({
      username: form.name,
      bio: form.bio,
      avatar_grad: form.avatarGrad,
    })
    // 更新本地存储和 store
    localStorage.setItem('sm_user', JSON.stringify(updated))
    store.setUserInfo(updated)
    savedDone.value = true
    savedCloseTimer = setTimeout(() => {
      savedDone.value = false
      emit('close')
    }, 1500)
  } catch (err: any) {
    console.error(err)
  } finally {
    saving.value = false
  }
}

function handleLogout() {
  localStorage.removeItem('sm_token')
  localStorage.removeItem('sm_logged_in')
  localStorage.removeItem('sm_user')
  router.push('/login')
  emit('close')
}
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(30,28,26,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  padding: 24px;
}

.modal {
  width: 100%;
  max-width: 520px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 24px 60px rgba(0,0,0,0.18);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(180deg, var(--bg-2), var(--surface));
  flex-shrink: 0;
}

.modal-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--ink);
  letter-spacing: -0.01em;
}

.modal-sub {
  font-size: 11.5px;
  color: var(--ink-3);
  margin-top: 2px;
}

.close-btn {
  width: 28px; height: 28px;
  border-radius: 8px;
  background: transparent;
  border: 1px solid var(--line);
  color: var(--ink-3);
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all .15s;
  font-family: var(--font-sans);
}
.close-btn:hover { background: var(--bg-3); color: var(--ink); }

.modal-body {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
}

.section-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--ink-3);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-family: var(--font-mono);
  margin-bottom: 12px;
}

.avatar-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.big-avatar {
  width: 64px; height: 64px;
  border-radius: 16px;
  flex-shrink: 0;
  color: white;
  font-size: 24px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: pointer;
  transition: filter .15s;
}
.big-avatar:hover { filter: brightness(0.9); }
.avatar-img {
  width: 100%; height: 100%;
  object-fit: cover;
  border-radius: 16px;
}

.avatar-actions {
  display: flex; gap: 6px; margin-bottom: 6px;
}
.avatar-action-btn {
  font-size: 11.5px;
  padding: 5px 10px;
  border-radius: 7px;
  background: var(--blue-2);
  color: white;
  border: none;
  cursor: pointer;
  font-family: var(--font-sans);
  transition: opacity .15s;
}
.avatar-action-btn:hover:not(:disabled) { opacity: 0.85; }
.avatar-action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.avatar-action-btn.ghost {
  background: transparent;
  color: var(--ink-2);
  border: 1px solid var(--line);
}
.color-swatches.disabled { opacity: 0.4; pointer-events: none; }

.pwd-panel {
  margin-top: 10px;
  padding: 12px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 10px;
  display: flex; flex-direction: column; gap: 10px;
}
.pwd-msg { font-size: 11.5px; color: #E24B4A; }
.pwd-msg.ok { color: #1D9E75; }
.pwd-actions {
  display: flex; justify-content: flex-end; gap: 8px;
}

.avatar-edit {
  position: absolute;
  bottom: -4px; right: -4px;
  width: 20px; height: 20px;
  border-radius: 6px;
  background: var(--blue-2);
  border: 2px solid var(--surface);
  display: flex;
  align-items: center;
  justify-content: center;
}
.avatar-edit svg { width: 10px; height: 10px; }

.avatar-hint {
  font-size: 11px;
  color: var(--ink-3);
  margin-bottom: 6px;
}

.color-swatches { display: flex; gap: 6px; }

.swatch {
  width: 22px; height: 22px;
  border-radius: 6px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: transform .1s;
}
.swatch:hover { transform: scale(1.1); }
.swatch.active { border-color: var(--ink); }

.fields { display: flex; flex-direction: column; gap: 12px; }

.field { display: flex; flex-direction: column; gap: 5px; }

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
  height: 40px;
  transition: all .15s;
}
.field-input svg { opacity: 0.4; flex-shrink: 0; }
.field-input.focused {
  border-color: var(--blue);
  background: var(--surface);
  box-shadow: 0 0 0 3px oklch(0.72 0.085 235 / 0.12);
}
.field-input.readonly {
  background: var(--bg-3);
  cursor: not-allowed;
}
.field-input input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  color: var(--ink);
  font-family: var(--font-sans);
}
.field-input input:disabled { color: var(--ink-3); cursor: not-allowed; }

.char-count {
  font-size: 10.5px;
  color: var(--ink-3);
  text-align: right;
  font-family: var(--font-mono);
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.goal-slider { flex: 1; accent-color: var(--blue-2); }
.slider-val {
  min-width: 28px;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--blue-2);
  font-family: var(--font-mono);
}

.seg {
  display: flex;
  background: var(--bg-2);
  border-radius: 9px;
  padding: 3px;
  border: 1px solid var(--line);
}
.seg-btn {
  flex: 1;
  padding: 7px 0;
  font-size: 12px;
  font-weight: 500;
  background: transparent;
  border: none;
  border-radius: 7px;
  color: var(--ink-3);
  cursor: pointer;
  transition: all .15s;
  font-family: var(--font-sans);
}
.seg-btn.active {
  background: var(--surface);
  color: var(--ink);
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}

.toggle-list { display: flex; flex-direction: column; }

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 0.5px solid var(--line);
}
.toggle-row:last-child { border-bottom: none; }

.toggle-info { font-size: 12.5px; color: var(--ink); }
.toggle-sub { font-size: 11px; color: var(--ink-3); margin-top: 1px; }

.toggle {
  width: 36px; height: 20px;
  border-radius: 10px;
  background: var(--bg-3);
  border: 1px solid var(--line);
  position: relative;
  cursor: pointer;
  transition: background .2s;
  flex-shrink: 0;
}
.toggle.on { background: var(--blue-2); border-color: var(--blue-2); }
.toggle-thumb {
  position: absolute;
  top: 2px; left: 2px;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
  transition: left .2s;
}
.toggle.on .toggle-thumb { left: 18px; }

.modal-divider {
  height: 0.5px;
  background: var(--line);
  margin: 0 -24px;
}

.danger-list { display: flex; flex-direction: column; }

.danger-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 0.5px solid var(--line);
}
.danger-row:last-child { border-bottom: none; }

.danger-info { font-size: 12.5px; color: var(--ink); }
.danger-sub { font-size: 11px; color: var(--ink-3); margin-top: 1px; }

.danger-btn {
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  font-family: var(--font-sans);
  transition: all .15s;
}
.danger-btn.outline {
  background: transparent;
  border: 1px solid var(--line);
  color: var(--ink-2);
}
.danger-btn.outline:hover { background: var(--bg-2); }
.danger-btn.red {
  background: #FCEBEB;
  border: 1px solid #F7C1C1;
  color: #E24B4A;
}
.danger-btn.red:hover { background: #F7C1C1; }

.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  background: linear-gradient(0deg, var(--bg-2), var(--surface));
  flex-shrink: 0;
}

.cancel-btn {
  padding: 8px 18px;
  border-radius: 9px;
  font-size: 13px;
  font-weight: 500;
  background: transparent;
  border: 1px solid var(--line);
  color: var(--ink-2);
  cursor: pointer;
  font-family: var(--font-sans);
  transition: background .15s;
}
.cancel-btn:hover { background: var(--bg-2); }

.save-btn {
  padding: 8px 20px;
  border-radius: 9px;
  font-size: 13px;
  font-weight: 600;
  background: linear-gradient(135deg, var(--blue), var(--blue-2));
  color: white;
  border: none;
  cursor: pointer;
  font-family: var(--font-sans);
  display: flex;
  align-items: center;
  gap: 6px;
  transition: opacity .15s;
}
.save-btn:hover:not(:disabled) { opacity: 0.88; }
.save-btn:disabled { opacity: 0.7; cursor: not-allowed; }
.save-btn.saved { background: linear-gradient(135deg, #1D9E75, #0F6E56); }

.spinner {
  width: 13px; height: 13px;
  border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.4);
  border-top-color: white;
  animation: spin .7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>