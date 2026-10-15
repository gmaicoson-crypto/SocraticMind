<template>
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
        <input v-model="pwdForm.next" type="password" autocomplete="new-password" minlength="6" />
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
</template>
<script setup lang="ts">
import { ref, reactive, onBeforeUnmount } from 'vue'
import { changePassword } from '../../api/auth'
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
onBeforeUnmount(() => {
  if (pwdHideTimer) clearTimeout(pwdHideTimer)
})
</script>
<style scoped src="./profileControls.css" />
<style scoped>
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
</style>
