<template>
  <BaseModal :model-value="true" @close="emit('close')">
    <div class="overlay" @click.self="emit('close')">
      <div class="modal">
        <div class="modal-header">
          <div>
            <div class="modal-title">编辑个人资料</div>
            <div class="modal-sub">更新你的个人信息</div>
          </div>
          <button class="close-btn" @click="emit('close')">✕</button>
        </div>

        <div class="modal-body">
          <div>
            <div class="section-label">基本信息</div>
            <div class="avatar-row">
              <button
                type="button"
                class="big-avatar"
                aria-label="上传用户头像"
                :disabled="uploading"
                @click="triggerUpload"
              >
                <img
                  :src="avatarPreview"
                  alt=""
                  class="avatar-img ui-avatar-image"
                  decoding="async"
                />
                <div class="avatar-edit">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--on-accent)"
                    stroke-width="2.5"
                    stroke-linecap="round"
                  >
                    <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
                  </svg>
                </div>
              </button>
              <input
                ref="fileInput"
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                style="display: none"
                @change="onFileChange"
              />
              <div class="avatar-actions">
                <button class="avatar-action-btn" :disabled="uploading" @click="triggerUpload">
                  {{ uploading ? '上传中…' : '上传图片' }}
                </button>
                <button
                  class="avatar-action-btn ghost"
                  :disabled="uploading"
                  @click="selectRandomAvatar"
                >
                  随机头像
                </button>
              </div>
            </div>

            <div class="avatar-hint">用户头像</div>
            <AvatarPresetPicker
              label="用户头像"
              :options="userAvatarPresets"
              :model-value="avatarUrl"
              :disabled="uploading"
              @select="avatarUrl = $event"
            />

            <div class="fields">
              <div class="field ui-field">
                <label>用户名</label>
                <div class="field-input" :class="{ focused: focusField === 'name' }">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    width="13"
                    height="13"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
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

              <div class="field ui-field">
                <label>个性签名</label>
                <div class="field-input" :class="{ focused: focusField === 'bio' }">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    width="13"
                    height="13"
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
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

              <div class="field ui-field">
                <label>邮箱地址</label>
                <div class="field-input readonly">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    width="13"
                    height="13"
                  >
                    <path
                      d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"
                    />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  <input type="email" :value="form.email" disabled />
                </div>
              </div>
            </div>
          </div>

          <div class="modal-divider" />

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
                <div class="field ui-field">
                  <label>原密码</label>
                  <div class="field-input">
                    <input v-model="pwdForm.old" type="password" autocomplete="current-password" />
                  </div>
                </div>
                <div class="field ui-field">
                  <label>新密码</label>
                  <div class="field-input">
                    <input
                      v-model="pwdForm.next"
                      type="password"
                      autocomplete="new-password"
                      minlength="6"
                    />
                  </div>
                </div>
                <div class="field ui-field">
                  <label>确认新密码</label>
                  <div class="field-input">
                    <input
                      v-model="pwdForm.confirm"
                      type="password"
                      autocomplete="new-password"
                      minlength="6"
                    />
                  </div>
                </div>
                <div v-if="pwdMsg" class="pwd-msg" :class="{ ok: pwdMsgType === 'ok' }">
                  {{ pwdMsg }}
                </div>
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

              <div class="danger-row">
                <div>
                  <div class="danger-info">注销账号</div>
                  <div class="danger-sub">永久删除账号与所有学习数据，不可恢复</div>
                </div>
                <button class="danger-btn red" @click="showDeleteModal = true">注销账号</button>
              </div>
            </div>
          </div>
        </div>

        <DeleteAccountModal
          :show="showDeleteModal"
          :submitting="deleting"
          :error-msg="deleteError"
          @close="showDeleteModal = false"
          @confirm="handleDeleteAccount"
        />

        <div v-if="saveError" class="save-error" role="alert">{{ saveError }}</div>
        <div class="modal-footer">
          <button class="cancel-btn" @click="emit('close')">取消</button>
          <button
            class="save-btn"
            :class="{ loading: saving, saved: savedDone }"
            :disabled="saving || uploading"
            @click="handleSave"
          >
            <div v-if="saving" class="spinner" />
            <svg
              v-else-if="savedDone"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--on-accent)"
              stroke-width="2.5"
              stroke-linecap="round"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
            <svg
              v-else
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--on-accent)"
              stroke-width="2.5"
              stroke-linecap="round"
            >
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <path d="M17 21v-8H7v8M7 3v5h8" />
            </svg>
            {{ saving ? '保存中…' : savedDone ? '已保存' : '保存更改' }}
          </button>
        </div>
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
// EditProfileModal 组件，封装局部界面和交互逻辑。
import { ref, reactive, computed, onBeforeUnmount, defineAsyncComponent } from 'vue'
import { useRouter } from 'vue-router'
import { useLearningStore } from '../../stores/learning'
import { updateMe, uploadAvatar, changePassword, deleteAccount } from '../../api/auth'
import { avatarSrc } from '../../utils/avatar'
import { defaultUserAvatar, userAvatarPresets } from '../../utils/avatarPresets'
import { clearAuth, updateUser } from '../../utils/token'
import BaseModal from '../ui/BaseModal.vue'
import AvatarPresetPicker from './AvatarPresetPicker.vue'

const DeleteAccountModal = defineAsyncComponent(() => import('./DeleteAccountModal.vue'))

const emit = defineEmits<{ close: [] }>()
const router = useRouter()

const focusField = ref('')
const saving = ref(false)
const savedDone = ref(false)
const saveError = ref('')

const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const localPreview = ref<string | null>(null)
const avatarUrl = ref(defaultUserAvatar)
const savedAvatarUrl = ref(defaultUserAvatar)

const avatarPreview = computed(() => localPreview.value ?? avatarSrc(avatarUrl.value))

function triggerUpload() {
  fileInput.value?.click()
}

async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]

  input.value = ''
  if (!file) return
  if (file.size > 5 * 1024 * 1024) {
    alert('图片大小不能超过 5MB')
    return
  }

  const reader = new FileReader()
  reader.onload = () => {
    localPreview.value = String(reader.result)
  }
  reader.readAsDataURL(file)

  uploading.value = true
  try {
    const updated = await uploadAvatar(file)
    avatarUrl.value = updated.avatar_url
    savedAvatarUrl.value = updated.avatar_url
    localPreview.value = null
    updateUser(updated)
    store.setUserInfo(updated)
  } catch (err: any) {
    alert(err?.response?.data?.detail ?? '上传失败')
    localPreview.value = null
  } finally {
    uploading.value = false
  }
}

function selectRandomAvatar() {
  const choices = userAvatarPresets.filter((url) => url !== avatarUrl.value)
  avatarUrl.value = choices[Math.floor(Math.random() * choices.length)]
  localPreview.value = null
}

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
    pwdHideTimer = setTimeout(() => {
      showPwdPanel.value = false
      pwdMsg.value = ''
    }, 1200)
  } catch (err: any) {
    pwdMsg.value = err?.response?.data?.detail ?? '修改失败'
    pwdMsgType.value = 'err'
  } finally {
    pwdSaving.value = false
  }
}

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
})

avatarUrl.value = store.userInfo?.avatar_url ?? defaultUserAvatar
savedAvatarUrl.value = avatarUrl.value

async function handleSave() {
  saveError.value = ''
  saving.value = true
  try {
    const avatarChanged = avatarUrl.value !== savedAvatarUrl.value
    const updated = await updateMe({
      username: form.name,
      bio: form.bio,
      ...(avatarChanged ? { avatar_url: avatarUrl.value } : {}),
    })
    if (avatarChanged && updated.avatar_url !== avatarUrl.value) {
      throw new Error('头像未保存，请刷新页面后重试')
    }

    savedAvatarUrl.value = updated.avatar_url
    updateUser(updated)
    store.setUserInfo(updated)
    savedDone.value = true
    savedCloseTimer = setTimeout(() => {
      savedDone.value = false
      emit('close')
    }, 1500)
  } catch (err: any) {
    console.error(err)
    saveError.value = err?.response?.data?.detail ?? err?.message ?? '保存失败，请重试'
  } finally {
    saving.value = false
  }
}

function handleLogout() {
  clearAuth()
  router.push('/login')
  emit('close')
}

const showDeleteModal = ref(false)
const deleting = ref(false)
const deleteError = ref('')

function clearAllUserScopedStorage() {
  const sessionKeys = [
    'sm_socratic_sessions',
    'sm_normal_sessions',
    'sm_socratic_cur',
    'sm_normal_cur',
    'sm_chips_socratic',
    'sm_chips_normal',
  ]
  for (const s of [localStorage, sessionStorage]) {
    for (const k of sessionKeys) s.removeItem(k)

    for (let i = s.length - 1; i >= 0; i--) {
      const k = s.key(i)
      if (k && (k.startsWith('sm_note_') || k === 'sm_note_draft')) {
        s.removeItem(k)
      }
    }
  }

  clearAuth()
}

async function handleDeleteAccount(payload: { password: string; confirm: string }) {
  deleteError.value = ''
  deleting.value = true
  try {
    await deleteAccount(payload.password, payload.confirm)
    clearAllUserScopedStorage()
    store.setUserInfo(null)
    store.clearGraph()
    showDeleteModal.value = false
    emit('close')
    router.push('/login')
  } catch (err: any) {
    deleteError.value = err?.response?.data?.detail ?? '注销失败，请稍后重试'
  } finally {
    deleting.value = false
  }
}
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-bg);
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
  box-shadow: var(--modal-shadow);
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
  background: var(--modal-header-bg);
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
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: transparent;
  border: 1px solid var(--line);
  color: var(--ink-3);
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  font-family: var(--font-sans);
}
.close-btn:hover {
  background: var(--bg-3);
  color: var(--ink);
}

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
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 16px;
}

.big-avatar {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  border: 0;
  padding: 0;
  cursor: pointer;
  transition: filter 0.15s;
}
.big-avatar:hover {
  filter: brightness(0.9);
}
.avatar-img {
  border-radius: 16px;
}

.avatar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.avatar-action-btn {
  font-size: 11.5px;
  padding: 5px 10px;
  border-radius: 7px;
  background: var(--blue-2);
  color: var(--on-accent);
  border: none;
  cursor: pointer;
  font-family: var(--font-sans);
  transition: opacity 0.15s;
}
.avatar-action-btn:hover:not(:disabled) {
  opacity: 0.85;
}
.avatar-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.avatar-action-btn.ghost {
  background: transparent;
  color: var(--ink-2);
  border: 1px solid var(--line);
}
.pwd-panel {
  margin-top: 10px;
  padding: 12px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pwd-msg {
  font-size: 11.5px;
  color: var(--danger-ink);
}
.pwd-msg.ok {
  color: var(--green);
}
.pwd-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.avatar-edit {
  position: absolute;
  bottom: -4px;
  right: -4px;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  background: var(--blue-2);
  border: 2px solid var(--surface);
  display: flex;
  align-items: center;
  justify-content: center;
}
.avatar-edit svg {
  width: 10px;
  height: 10px;
}

.avatar-hint {
  font-size: 11px;
  color: var(--ink-3);
  margin-bottom: 6px;
}

.fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field-input {
  height: 40px;
  transition: all 0.15s;
}
.field-input.readonly {
  background: var(--surface-inset);
  cursor: not-allowed;
}
.field-input input:disabled {
  color: var(--ink-3);
  cursor: not-allowed;
}

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
.goal-slider {
  flex: 1;
  accent-color: var(--blue-2);
}
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
  background: var(--surface-inset);
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
  transition: all 0.15s;
  font-family: var(--font-sans);
}
.seg-btn.active {
  background: var(--surface);
  color: var(--ink);
  box-shadow: var(--control-shadow);
}

.toggle-list {
  display: flex;
  flex-direction: column;
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 0.5px solid var(--line);
}
.toggle-row:last-child {
  border-bottom: none;
}

.toggle-info {
  font-size: 12.5px;
  color: var(--ink);
}
.toggle-sub {
  font-size: 11px;
  color: var(--ink-3);
  margin-top: 1px;
}

.toggle {
  width: 36px;
  height: 20px;
  border-radius: 10px;
  background: var(--bg-3);
  border: 1px solid var(--line);
  position: relative;
  cursor: pointer;
  transition: background 0.2s;
  flex-shrink: 0;
}
.toggle.on {
  background: var(--blue-2);
  border-color: var(--blue-2);
}
.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--on-accent);
  box-shadow: var(--control-shadow);
  transition: left 0.2s;
}
.toggle.on .toggle-thumb {
  left: 18px;
}

.modal-divider {
  height: 0.5px;
  background: var(--line);
  margin: 0 -24px;
}

.danger-list {
  display: flex;
  flex-direction: column;
}

.danger-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 0.5px solid var(--line);
}
.danger-row:last-child {
  border-bottom: none;
}

.danger-info {
  font-size: 12.5px;
  color: var(--ink);
}
.danger-sub {
  font-size: 11px;
  color: var(--ink-3);
  margin-top: 1px;
}

.danger-btn {
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  font-family: var(--font-sans);
  transition: all 0.15s;
}
.danger-btn.outline {
  background: transparent;
  border: 1px solid var(--line);
  color: var(--ink-2);
}
.danger-btn.outline:hover {
  background: var(--bg-2);
}
.danger-btn.red {
  background: var(--danger-button-bg);
  border: 1px solid var(--danger-button-border);
  color: var(--danger-button-text);
}
.danger-btn.red:hover {
  background: var(--danger-button-hover-bg);
}

.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  background: var(--modal-footer-bg);
  flex-shrink: 0;
}

.save-error {
  padding: 8px 24px 0;
  color: var(--danger-ink);
  font-size: 12px;
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
  transition: background 0.15s;
}
.cancel-btn:hover {
  background: var(--bg-2);
}

.save-btn {
  padding: 8px 20px;
  border-radius: 9px;
  font-size: 13px;
  font-weight: 600;
  background: var(--accent-gradient);
  color: var(--on-accent);
  border: none;
  cursor: pointer;
  font-family: var(--font-sans);
  display: flex;
  align-items: center;
  gap: 6px;
  transition: opacity 0.15s;
}
.save-btn:hover:not(:disabled) {
  opacity: 0.88;
}
.save-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
.save-btn.saved {
  background: var(--success-gradient);
}

.spinner {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  border: 2px solid var(--on-accent-border);
  border-top-color: var(--on-accent);
  animation: spin 0.7s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
