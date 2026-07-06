<template>
  <BaseModal :model-value="show" @close="$emit('close')">
      <div class="legal-overlay" @click.self="$emit('close')">
        <div class="legal-modal">
          <div class="legal-header">
            <div class="legal-title">{{ kind === 'terms' ? '服务条款' : '隐私政策' }}</div>
            <button class="legal-close ui-modal-close" @click="$emit('close')">✕</button>
          </div>
          <div class="legal-body">
            <div v-if="kind === 'terms'">
              <p class="legal-meta">最后更新：2026 年 5 月 · 适用于 SocraticMind（下称"本服务"）</p>

              <h3>一、接受条款</h3>
              <p>当您注册账号或使用本服务时，即表示您已阅读、理解并同意受本《服务条款》约束。若您不同意任何条款，请停止使用本服务。</p>

              <h3>二、账号注册与安全</h3>
              <p>您应使用真实有效的邮箱完成注册，并自行妥善保管账号密码。因您的疏忽（如泄露密码、共享账号）导致的损失，由您自行承担。账号一经创建即归您所有，禁止转让或出售。</p>
              <p>我们保留对违反本条款、滥用本服务或从事非法活动的账号予以警告、限制或终止的权利。</p>

              <h3>三、用户行为规范</h3>
              <p>您在使用本服务时，承诺不会：</p>
              <ul>
                <li>上传、发布违反中国法律法规或公序良俗的内容；</li>
                <li>试图通过爬虫、自动化脚本或其他手段绕过限流、登录或验证机制；</li>
                <li>对本服务进行反向工程、破解或恶意压力测试；</li>
                <li>冒用他人身份或盗用他人账号。</li>
              </ul>

              <h3>四、知识产权</h3>
              <p>本服务的代码、UI 设计、提示词模板及视觉资产，归本服务团队所有。您在本服务中创建的笔记、对话内容归您本人所有，但您授权本服务以匿名、聚合形式用于产品改进与模型训练（如有）。</p>

              <h3>五、AI 生成内容免责</h3>
              <p>本服务的对话与解析由 AI 生成，可能存在事实性错误或偏差。请您结合教材、官方文档或专业人士的建议进行判断，不应将 AI 输出视为权威结论。因依赖 AI 输出造成的任何后果，本服务不承担责任。</p>

              <h3>六、服务变更与终止</h3>
              <p>我们可能因维护、升级或不可抗力暂停服务；也保留在重大变更时修改本条款的权利，重大变更将通过站内通知或邮件告知。继续使用即视为接受变更。</p>

              <h3>七、责任限制</h3>
              <p>在法律允许的最大范围内，本服务因技术故障、第三方行为或不可抗力导致的服务中断、数据延迟或丢失，我们不承担连带或间接责任。</p>

              <h3>八、联系方式</h3>
              <p>如对本条款有疑问或申诉，请通过 GitHub Issue 或站内邮件与我们联系。</p>
            </div>

            <div v-else>
              <p class="legal-meta">最后更新：2026 年 5 月 · 我们尊重并依法保护您的个人信息</p>

              <h3>一、我们收集哪些信息</h3>
              <ul>
                <li><strong>注册信息</strong>：用户名、邮箱、加密后的密码哈希；</li>
                <li><strong>资料信息</strong>：头像、个人简介、每日目标、AI 偏好风格（均由您自行填写）；</li>
                <li><strong>学习数据</strong>：知识图谱节点、AI 对话内容、笔记、画板、连续学习记录；</li>
                <li><strong>技术信息</strong>：用于限流与异常排查的 IP 地址、请求时间、错误日志（短期保留）。</li>
              </ul>

              <h3>二、我们如何使用这些信息</h3>
              <ul>
                <li>提供核心功能：保存学习进度、生成个性化推荐、维持登录态；</li>
                <li>保障账号安全：异地登录提醒、登录失败限制、邮箱验证；</li>
                <li>改进服务：在去标识化、聚合化的前提下分析使用情况；</li>
                <li>必要时遵守法律义务或配合执法调查。</li>
              </ul>
              <p>我们<strong>不会</strong>将您的学习内容用于广告画像，也<strong>不会</strong>把可识别个人身份的信息出售给任何第三方。</p>

              <h3>三、密码与验证码</h3>
              <p>您的密码经 bcrypt 单向加盐哈希存储，原文从不落库；服务端工程师亦无法读取。邮箱验证码 10 分钟内一次性有效，使用后立即作废。</p>

              <h3>四、Cookie 与本地存储</h3>
              <p>我们使用 <code>localStorage</code> 保存登录令牌（JWT）与少量界面偏好，便于您下次直接登录。您可随时清除浏览器数据以登出。</p>

              <h3>五、第三方服务</h3>
              <p>本服务调用大语言模型 API（如 DeepSeek）以生成对话。您发送给 AI 的内容会以请求形式经过该服务商；他们的隐私政策独立适用，请您知悉。除此之外，我们不接入广告或行为分析 SDK。</p>

              <h3>六、您的权利</h3>
              <ul>
                <li><strong>访问 / 修改</strong>：您可在「个人中心」修改资料与密码；</li>
                <li><strong>删除</strong>：如需注销账号或导出数据，请通过 GitHub Issue 联系我们，我们将在 15 个工作日内处理；</li>
                <li><strong>撤回同意</strong>：您可随时停止使用并清除本地数据。</li>
              </ul>

              <h3>七、未成年人保护</h3>
              <p>若您未满 14 周岁，请在监护人陪同下使用本服务，并由监护人代为同意本政策。</p>

              <h3>八、政策更新</h3>
              <p>本政策有重大变更时，我们会在登录页或站内显著位置提示。继续使用即视为同意更新后的版本。</p>
            </div>
          </div>
          <div class="legal-footer">
            <button class="legal-ok" @click="$emit('close')">我已阅读</button>
          </div>
        </div>
      </div>
  </BaseModal>
</template>

<script setup lang="ts">
// LegalModal 组件，封装局部界面和交互逻辑。
import BaseModal from '../ui/BaseModal.vue'

defineProps<{ show: boolean; kind: 'terms' | 'privacy' }>()
defineEmits<{ (e: 'close'): void }>()
</script>

<style scoped>
.legal-overlay {
  position: fixed;
  inset: 0;
  z-index: 350;
  background: rgba(0,0,0,0.36);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.legal-modal {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
  width: min(720px, 100%);
  height: min(640px, 100%);
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 48px rgba(0,0,0,0.18);
  overflow: hidden;
}
.legal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}
.legal-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
}
.legal-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 18px 24px;
  font-size: 13px;
  line-height: 1.75;
  color: var(--ink-2);
}
.legal-body :deep(h3) {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--ink);
  margin: 18px 0 6px;
}
.legal-body :deep(h3:first-child) {
  margin-top: 0;
}
.legal-body :deep(p) {
  margin: 6px 0;
}
.legal-body :deep(ul) {
  padding-left: 20px;
  margin: 6px 0;
}
.legal-body :deep(li) {
  margin: 3px 0;
}
.legal-body :deep(strong) {
  color: var(--ink);
  font-weight: 600;
}
.legal-body :deep(code) {
  font-family: var(--font-mono);
  background: var(--bg-3);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 12px;
}
.legal-meta {
  font-size: 11.5px;
  color: var(--ink-3);
  padding-bottom: 10px;
  margin-bottom: 10px;
  border-bottom: 1px dashed var(--line);
}

.legal-footer {
  border-top: 1px solid var(--line);
  padding: 12px 20px;
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
}
.legal-ok {
  height: 34px;
  padding: 0 18px;
  border-radius: 8px;
  border: none;
  background: linear-gradient(135deg, var(--blue), var(--blue-2));
  color: white;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  font-family: var(--font-sans);
}
.legal-ok:hover {
  opacity: 0.9;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity .2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
