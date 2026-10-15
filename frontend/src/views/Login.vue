<template>
  <div class="login-page">
    <div class="login-shell">
      <div class="brand">
        <div class="brand-logo">
          <div class="brand-icon">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--on-accent)"
              stroke-width="2"
              stroke-linecap="round"
            >
              <circle cx="12" cy="6" r="2.5" fill="var(--on-accent)" stroke="none" />
              <circle cx="6" cy="16" r="2" fill="var(--on-accent)" stroke="none" />
              <circle cx="18" cy="16" r="2" fill="var(--on-accent)" stroke="none" />
              <path d="M12 8L6 14M12 8L18 14M8 16H16" />
            </svg>
          </div>
          <div>
            <div class="brand-name">Socratic<span>Mind</span></div>
            <div class="brand-tagline">AI Guided Learning</div>
          </div>
        </div>

        <div class="brand-hero">
          <div class="brand-headline">不给答案，<br />只给你<em>思考的路</em></div>
          <div class="brand-desc">
            通过苏格拉底式引导，AI 帮你主动发现知识，而不是被动接受。每一个问题都是通往掌握的一步。
          </div>

          <div class="features">
            <div v-for="feat in features" :key="feat.title" class="feat">
              <div class="feat-icon ui-icon-surface">
                <component :is="feat.icon" :size="15" aria-hidden="true" />
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

      <AuthenticationForm />
    </div>
  </div>
</template>

<script setup lang="ts">
import { Sparkles, Network, AlignLeft } from '@lucide/vue'
import AuthenticationForm from '../components/auth/AuthenticationForm.vue'
const features = [
  {
    title: '苏格拉底式 AI 对话',
    desc: '引导提问，不直接给答案，激发真正的理解',
    icon: Sparkles,
  },
  {
    title: '动态知识图谱',
    desc: '可视化学习路径，节点状态实时联动',
    icon: Network,
  },
  {
    title: '笔记与画布',
    desc: 'Markdown 笔记 + 手绘画板，随时记录灵感',
    icon: AlignLeft,
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
  box-shadow: var(--shadow-auth);
}

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
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--accent-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--brand-shadow);
}

.brand-name {
  font-size: 18px;
  font-weight: 700;
  color: var(--ink);
  letter-spacing: -0.01em;
}
.brand-name span {
  color: var(--blue-2);
}

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
  width: 32px;
  height: 32px;
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
</style>
