<template>
  <section class="plan-panel">
    <header class="plan-header">
      <div>
        <p>Today</p>
        <h2>今日学习计划</h2>
      </div>
      <span v-if="plan">{{ plan.date }}</span>
    </header>

    <div v-if="plans.loading && !plan" class="panel-state">正在加载计划</div>
    <div v-else-if="plans.error && !plan" class="panel-state error-state">
      <span>{{ plans.error.message }}</span>
      <BaseButton @click="loadPlan">重试</BaseButton>
    </div>
    <EmptyState v-else-if="isEmpty" message="当前主题还没有学习计划">
      <template v-if="activeTopic" #action>
        <BaseButton class="primary-action" @click="createTopicPlan">为当前主题创建计划</BaseButton>
      </template>
    </EmptyState>
    <div v-else class="plan-scroll">
      <section v-if="plan?.overdue.length" class="plan-section overdue-section">
        <div class="section-heading">
          <div><h3>过期</h3><span>{{ plan.overdue.length }} 项待处理</span></div>
          <BaseButton :loading="plans.replanning" @click="replanOverdue">
            <template #loading>正在重排</template>
            重新规划
          </BaseButton>
        </div>
        <PlanTaskRow
          v-for="item in plan.overdue"
          :key="taskKey(item)"
          :item="item"
          :busy="navigatingKey === taskKey(item)"
          @select="navigateToTask"
        />
      </section>

      <section v-if="plan?.today.length" class="plan-section">
        <div class="section-heading"><div><h3>今日</h3><span>{{ plan.today.length }} 项</span></div><span>{{ todayMinutes }} 分钟</span></div>
        <PlanTaskRow
          v-for="item in plan.today"
          :key="taskKey(item)"
          :item="item"
          :busy="navigatingKey === taskKey(item)"
          @select="navigateToTask"
        />
      </section>

      <section v-if="plan?.upcoming.length" class="plan-section upcoming-section">
        <div class="section-heading"><div><h3>后续</h3><span>{{ plan.upcoming.length }} 项</span></div></div>
        <PlanTaskRow
          v-for="item in plan.upcoming"
          :key="taskKey(item)"
          :item="item"
          :busy="navigatingKey === taskKey(item)"
          @select="navigateToTask"
        />
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAgentStore } from '../stores/agent'
import { useLearningStore } from '../stores/learning'
import { usePlansStore } from '../stores/plans'
import type { TodayPlanItem } from '../types/learningAgent'
import BaseButton from './ui/BaseButton.vue'
import EmptyState from './ui/EmptyState.vue'
import PlanTaskRow from './planning/PlanTaskRow.vue'

const emit = defineEmits<{ navigated: [] }>()
const learning = useLearningStore()
const plans = usePlansStore()
const agent = useAgentStore()
const navigatingKey = ref<string | null>(null)
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
const plan = computed(() => plans.todayPlan)
const activeTopic = computed(() => learning.topics.find(topic => topic.id === learning.activeTopicId) ?? null)
const isEmpty = computed(() => !plan.value || (
  plan.value.today.length === 0 && plan.value.overdue.length === 0 && plan.value.upcoming.length === 0
))
const todayMinutes = computed(() => plan.value?.today.reduce((total, item) => total + item.estimated_minutes, 0) ?? 0)

onMounted(loadPlan)

function loadPlan() {
  return plans.fetchToday(timezone)
}

function taskKey(item: TodayPlanItem) {
  return `${item.plan_id}:${item.node_id}:${item.scheduled_date}`
}

async function navigateToTask(item: TodayPlanItem) {
  const key = taskKey(item)
  if (navigatingKey.value) return
  navigatingKey.value = key
  try {
    await learning.setActiveTopic(String(item.topic_id))
    const node = learning.nodes.find(candidate => candidate.dbId === item.node_id)
    if (node) {
      learning.setActiveNode(node)
      emit('navigated')
    }
  } finally {
    navigatingKey.value = null
  }
}

async function replanOverdue() {
  if (!plan.value?.overdue.length) return
  await plans.replanOverdue(plan.value.overdue.map(item => item.plan_id), plan.value.effective_timezone)
}

function createTopicPlan() {
  if (!activeTopic.value) return
  agent.openTopicPlan(Number(activeTopic.value.id), activeTopic.value.title)
}
</script>

<style scoped>
.plan-panel { display: flex; flex-direction: column; min-height: 0; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); color: var(--ink); }
.plan-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 15px 16px; border-bottom: 1px solid var(--line); background: var(--bg-2); }
.plan-header p { margin: 0 0 3px; color: var(--blue-2); font-size: 10px; font-weight: 700; text-transform: uppercase; }
.plan-header h2 { margin: 0; font-size: 15px; letter-spacing: 0; }
.plan-header > span { color: var(--ink-3); font-size: 11px; font-family: var(--font-mono); }
.plan-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 16px 18px; }
.plan-section { padding-top: 18px; }
.plan-section + .plan-section { margin-top: 4px; border-top: 1px solid var(--line); }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.section-heading > div { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.section-heading h3 { margin: 0; font-size: 12px; }
.section-heading span { color: var(--ink-3); font-size: 10.5px; }
.section-heading :deep(.ui-button), .primary-action { height: 30px; padding: 0 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg-2); color: var(--ink-2); cursor: pointer; font-size: 11px; }
.overdue-section h3 { color: #b45309; }
.panel-state, :deep(.ui-empty-state) { display: grid; place-items: center; align-content: center; gap: 12px; flex: 1; min-height: 0; padding: 24px; color: var(--ink-3); font-size: 12px; text-align: center; }
.error-state { color: #b91c1c; }
.primary-action { border-color: var(--blue-2) !important; background: var(--blue-2) !important; color: white !important; }
@media (max-width: 640px) {
  .plan-header, .plan-scroll { padding-left: 12px; padding-right: 12px; }
}
</style>
