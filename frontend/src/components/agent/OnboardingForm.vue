<template>
  <form class="agent-tool onboarding-form" @submit.prevent="submit">
    <div class="tool-heading">
      <div>
        <p class="tool-kicker">{{ mode === 'existing-topic' ? '创建主题计划' : '新学习主题' }}</p>
        <h3>{{ form.topic }}</h3>
      </div>
    </div>

    <div class="form-grid">
      <label class="field field-wide">
        <span>学习目标</span>
        <BaseInput v-model="form.goal" name="goal" maxlength="300" required />
      </label>
      <label class="field">
        <span>领域范围</span>
        <BaseInput v-model="form.domain" name="domain" maxlength="100" required />
      </label>
      <label class="field">
        <span>成果类型</span>
        <select v-model="form.outcome_type" name="outcome_type">
          <option v-for="option in outcomes" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>
      <label class="field">
        <span>当前熟悉度</span>
        <select v-model="form.familiarity" name="familiarity">
          <option value="new">全新接触</option>
          <option value="beginner">入门</option>
          <option value="intermediate">有基础</option>
          <option value="advanced">较熟练</option>
        </select>
      </label>
      <label class="field">
        <span>每日分钟</span>
        <BaseInput
          v-model="form.daily_minutes"
          name="daily_minutes"
          type="number"
          min="5"
          max="240"
        />
      </label>
      <label class="field">
        <span>目标日期</span>
        <BaseInput v-model="form.target_date" name="target_date" type="date" />
      </label>
    </div>

    <label class="diagnostic-toggle">
      <input v-model="form.use_diagnostic" name="use_diagnostic" type="checkbox" />
      <span>进行3题测试</span>
    </label>
    <p v-if="error" class="form-error">{{ error }}</p>

    <div class="tool-actions">
      <BaseButton :disabled="busy" @click="emit('cancel')">取消</BaseButton>
      <BaseButton class="primary" type="submit" :loading="busy">
        <template #loading>处理中</template>
        {{ mode === 'existing-topic' ? '生成计划' : '开始' }}
      </BaseButton>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import type { OnboardingInput, OutcomeType } from '../../types/learningAgent'
import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'

const props = withDefaults(
  defineProps<{
    topic: string
    sessionId: string
    busy?: boolean
    defaultTimezone?: string
    error?: string
    mode?: 'new-topic' | 'existing-topic'
  }>(),
  {
    busy: false,
    defaultTimezone: '',
    error: '',
    mode: 'new-topic',
  },
)

const emit = defineEmits<{
  submit: [input: OnboardingInput]
  cancel: []
}>()

const outcomes: { value: OutcomeType; label: string }[] = [
  { value: 'concept', label: '理解概念' },
  { value: 'procedure', label: '掌握操作' },
  { value: 'analysis', label: '分析判断' },
  { value: 'expression', label: '表达输出' },
  { value: 'creation', label: '创作实践' },
  { value: 'mixed', label: '综合目标' },
]

const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
const form = reactive({
  topic: props.topic,
  goal: `系统掌握${props.topic}`,
  domain: '通识学习',
  outcome_type: 'concept' as OutcomeType,
  familiarity: 'new' as OnboardingInput['familiarity'],
  daily_minutes: 30,
  target_date: '',
  timezone: props.defaultTimezone || browserTimezone,
  use_diagnostic: true,
})

watch(
  () => props.topic,
  (topic) => {
    form.topic = topic
    form.goal = `系统掌握${topic}`
  },
)

function submit() {
  emit('submit', {
    ...form,
    goal: form.goal.trim(),
    domain: form.domain.trim(),
    timezone: form.timezone.trim(),
    daily_minutes: Number(form.daily_minutes),
    target_date: form.target_date || null,
    session_id: props.sessionId,
  })
}
</script>

<style scoped>
.agent-tool {
  width: min(100%, 520px);
  align-self: center;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  padding: 12px;
  color: var(--ink);
}
.tool-heading {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}
.tool-kicker {
  margin: 0 0 2px;
  color: var(--blue-2);
  font-size: 11px;
  font-weight: 700;
}
h3 {
  margin: 0;
  font-size: 15px;
  overflow-wrap: anywhere;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}
.field {
  display: grid;
  gap: 4px;
  min-width: 0;
  color: var(--ink-2);
  font-size: 11px;
}
.field-wide {
  grid-column: 1 / -1;
}
.field :deep(.ui-input),
select {
  width: 100%;
  min-width: 0;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--bg);
  color: var(--ink);
  font: inherit;
  font-size: 12px;
}
.diagnostic-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  color: var(--ink-2);
  font-size: 12px;
}
.diagnostic-toggle input {
  width: 16px;
  height: 16px;
  accent-color: var(--blue-2);
}
.form-error {
  margin: 10px 0 0;
  color: var(--danger-strong);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.tool-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
.tool-actions :deep(.ui-button) {
  min-width: 64px;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--bg-2);
  color: var(--ink-2);
  font-size: 12px;
  cursor: pointer;
}
.tool-actions :deep(.primary) {
  border-color: var(--blue-2);
  background: var(--blue-2);
  color: var(--on-accent);
}
@media (max-width: 640px) {
  .agent-tool {
    padding: 12px;
  }
  .form-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .field-wide {
    grid-column: auto;
  }
}
</style>
