<template>
  <div class="card goal-card">
    <div class="goal-header">
      <div class="card-title" style="margin-bottom:0">今日目标</div>
      <button class="goal-edit-btn" title="设置目标" @click="openModal">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M12 5v14M5 12h14"/>
        </svg>
      </button>
    </div>
    <div class="ring-area">
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="38" fill="none" stroke="var(--bg-3)" stroke-width="10"/>
        <circle
          cx="50" cy="50" r="38" fill="none" stroke="var(--blue-2)" stroke-width="10"
          :stroke-dasharray="circumference" :stroke-dashoffset="dashOffset"
          stroke-linecap="round" transform="rotate(-90 50 50)"
        />
        <text x="50" y="47" text-anchor="middle" font-size="18" font-weight="700" fill="var(--ink)" font-family="monospace">{{ totalPct }}%</text>
        <text x="50" y="61" text-anchor="middle" font-size="9" fill="var(--ink-3)">{{ doneCount }}/{{ enabledCount }} 目标</text>
      </svg>
    </div>
    <div class="goal-list">
      <div v-for="goal in goalItems" :key="goal.key" class="goal-item">
        <div class="goal-item-main">
          <span class="goal-label">{{ goal.label }}</span>
          <span class="goal-val" :class="{ done: goal.done }">
            {{ goal.done ? '✓ 完成' : goal.val }}
          </span>
        </div>
        <div class="goal-progress-bar">
          <div
            class="goal-progress-fill"
            :style="{ width: Math.min(goal.pct, 100) + '%', background: goal.done ? 'var(--blue-2)' : 'var(--blue)' }"
          />
        </div>
      </div>
    </div>

    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showModal" class="goal-modal-overlay" @click.self="showModal = false">
          <div class="goal-modal">
            <div class="goal-modal-header">
              <div class="goal-modal-title">设置今日目标</div>
              <button class="goal-modal-close" @click="showModal = false">✕</button>
            </div>
            <div class="goal-modal-body">
              <div v-for="item in editItems" :key="item.key" class="goal-edit-row">
                <div class="goal-edit-left">
                  <label class="goal-toggle">
                    <input v-model="item.enabled" type="checkbox" />
                    <span class="goal-toggle-slider" />
                  </label>
                  <div>
                    <div class="goal-edit-label">{{ item.label }}</div>
                    <div class="goal-edit-sub">{{ item.sub }}</div>
                  </div>
                </div>
                <div class="goal-edit-right">
                  <button class="goal-num-btn" :disabled="!item.enabled || item.target <= 1" @click="item.target--">−</button>
                  <input
                    v-model.number="item.target"
                    class="goal-num-input"
                    type="number"
                    :disabled="!item.enabled"
                    :min="1"
                    @input="item.target = Math.max(1, item.target)"
                  />
                  <span class="goal-unit">{{ item.unit }}</span>
                  <button class="goal-num-btn" :disabled="!item.enabled" @click="item.target++">＋</button>
                </div>
              </div>
            </div>
            <div class="goal-modal-footer">
              <div class="goal-reset-btn" @click="resetToDefault">恢复默认</div>
              <button class="goal-save-btn" @click="save">保存目标</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch, onMounted } from 'vue'
import {
  loadGoalConfig, saveGoalConfig, getDefaultGoal, loadTodayProgress,
  type DailyGoalConfig,
} from '../../utils/dailyGoal'
import type { Topic } from '../../types'

const props = defineProps<{
  userId: number | undefined
  todayChatCount: number
  masteredCount: number
  todayStudyMinutes: number
  topics: Topic[]
}>()

const circumference = 2 * Math.PI * 38

const goalConfig = ref<DailyGoalConfig>(getDefaultGoal())
const showModal = ref(false)

onMounted(() => {
  if (props.userId) goalConfig.value = loadGoalConfig(props.userId)
})

watch(() => props.userId, (id) => {
  if (id) goalConfig.value = loadGoalConfig(id)
})

// 已完成主题数：所有节点均已掌握的主题
const completedTopics = computed(() =>
  props.topics.filter(t => t.nodes > 0 && t.mastered === t.nodes).length
)

// 将启用的目标项整理为统一列表，环形图和列表共用
const goalItems = computed(() => {
  const cfg = goalConfig.value
  const items: { key: string; label: string; val: string; done: boolean; pct: number }[] = []
  const add = (key: string, enabled: boolean, current: number, target: number, label: string) => {
    if (!enabled) return
    items.push({
      key, label,
      val: `${current}/${target}`,
      done: current >= target,
      pct: Math.min(current / target * 100, 100),
    })
  }
  add('chat_count', cfg.chat_count.enabled, props.todayChatCount, cfg.chat_count.target,
      `完成对话 ${cfg.chat_count.target} 轮`)
  add('mastered_nodes', cfg.mastered_nodes.enabled, props.masteredCount, cfg.mastered_nodes.target,
      `掌握 ${cfg.mastered_nodes.target} 个节点`)
  add('completed_topics', cfg.completed_topics.enabled, completedTopics.value, cfg.completed_topics.target,
      `完成 ${cfg.completed_topics.target} 个主题`)
  add('study_minutes', cfg.study_minutes.enabled, props.todayStudyMinutes, cfg.study_minutes.target,
      `学习 ${cfg.study_minutes.target} 分钟`)
  return items
})

const enabledCount = computed(() => goalItems.value.length)
const doneCount = computed(() => goalItems.value.filter(g => g.done).length)
const totalPct = computed(() =>
  enabledCount.value === 0 ? 0 : Math.round(doneCount.value / enabledCount.value * 100)
)
const dashOffset = computed(() => circumference - (totalPct.value / 100) * circumference)

// 弹窗编辑副本，保存前不影响主显示
const editItems = reactive([
  { key: 'chat_count',       label: '学习对话次数', sub: '完成苏格拉底式对话的轮次',     unit: '轮',    enabled: true,  target: 5  },
  { key: 'mastered_nodes',   label: '掌握节点数',   sub: '今日标记为已掌握的知识节点',   unit: '个',    enabled: true,  target: 2  },
  { key: 'completed_topics', label: '完成主题数',   sub: '今日全部节点已掌握的主题',     unit: '个',    enabled: false, target: 1  },
  { key: 'study_minutes',    label: '学习时长',     sub: '在学习页面停留的时间',         unit: '分钟',  enabled: true,  target: 30 },
])

// 打开弹窗时将当前配置复制到编辑副本
function openModal() {
  const cfg = goalConfig.value
  editItems[0].enabled = cfg.chat_count.enabled;       editItems[0].target = cfg.chat_count.target
  editItems[1].enabled = cfg.mastered_nodes.enabled;   editItems[1].target = cfg.mastered_nodes.target
  editItems[2].enabled = cfg.completed_topics.enabled; editItems[2].target = cfg.completed_topics.target
  editItems[3].enabled = cfg.study_minutes.enabled;    editItems[3].target = cfg.study_minutes.target
  showModal.value = true
}

// 保存目标并持久化
function save() {
  const newConfig: DailyGoalConfig = {
    chat_count:       { enabled: editItems[0].enabled, target: editItems[0].target },
    mastered_nodes:   { enabled: editItems[1].enabled, target: editItems[1].target },
    completed_topics: { enabled: editItems[2].enabled, target: editItems[2].target },
    study_minutes:    { enabled: editItems[3].enabled, target: editItems[3].target },
  }
  goalConfig.value = newConfig
  if (props.userId) saveGoalConfig(props.userId, newConfig)
  showModal.value = false
}

// 恢复默认目标配置
function resetToDefault() {
  const def = getDefaultGoal()
  editItems[0].enabled = def.chat_count.enabled;       editItems[0].target = def.chat_count.target
  editItems[1].enabled = def.mastered_nodes.enabled;   editItems[1].target = def.mastered_nodes.target
  editItems[2].enabled = def.completed_topics.enabled; editItems[2].target = def.completed_topics.target
  editItems[3].enabled = def.study_minutes.enabled;    editItems[3].target = def.study_minutes.target
}
</script>

<style scoped>
.card {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: 12px; padding: 18px 20px;
  display: flex; flex-direction: column;
}
.card-title {
  font-size: 11px; font-weight: 600; color: var(--ink-3);
  text-transform: uppercase; letter-spacing: 0.07em;
  font-family: var(--font-mono); margin-bottom: 14px;
}
.goal-card { display: flex; flex-direction: column; gap: 0; }
.goal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.goal-edit-btn {
  width: 24px; height: 24px;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-2); border: 1px solid var(--line);
  border-radius: 6px; color: var(--ink-3); cursor: pointer; transition: all .15s;
}
.goal-edit-btn:hover { background: var(--blue-tint); border-color: var(--blue-line); color: var(--blue-2); }

.ring-area { display: flex; justify-content: center; align-items: center; flex: 1; margin-bottom: 16px; }
.goal-list { display: flex; flex-direction: column; gap: 8px; }
.goal-item { display: flex; flex-direction: column; gap: 4px; }
.goal-item-main { display: flex; justify-content: space-between; align-items: center; }
.goal-label { color: var(--ink-2); font-size: 12px; }
.goal-val { color: var(--ink-3); font-family: var(--font-mono); font-size: 11px; }
.goal-val.done { color: var(--blue-2); font-weight: 600; }
.goal-progress-bar { height: 3px; background: var(--bg-3); border-radius: 99px; overflow: hidden; }
.goal-progress-fill { height: 100%; border-radius: 99px; transition: width .4s ease; }

.goal-modal-overlay {
  position: fixed; inset: 0; z-index: 300;
  background: rgba(0,0,0,0.3); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
}
.goal-modal {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: 16px; width: 380px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.15);
  display: flex; flex-direction: column;
}
.goal-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 20px 14px; border-bottom: 1px solid var(--line);
}
.goal-modal-title { font-size: 15px; font-weight: 700; color: var(--ink); }
.goal-modal-close {
  background: transparent; border: none; color: var(--ink-3);
  cursor: pointer; font-size: 14px; padding: 2px 6px; border-radius: 4px;
}
.goal-modal-close:hover { background: var(--bg-2); color: var(--ink); }

.goal-modal-body { padding: 14px 20px; display: flex; flex-direction: column; gap: 14px; }
.goal-edit-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 12px; border-radius: 10px; background: var(--bg-2);
}
.goal-edit-left { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
.goal-edit-label { font-size: 13px; font-weight: 500; color: var(--ink); }
.goal-edit-sub { font-size: 10.5px; color: var(--ink-3); margin-top: 1px; }
.goal-edit-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.goal-num-btn {
  width: 24px; height: 24px; border-radius: 6px;
  background: var(--surface); border: 1px solid var(--line);
  color: var(--ink); cursor: pointer; font-size: 14px;
  display: flex; align-items: center; justify-content: center; transition: all .15s;
}
.goal-num-btn:hover:not(:disabled) { background: var(--blue-tint); border-color: var(--blue-line); color: var(--blue-2); }
.goal-num-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.goal-num-input {
  width: 48px; height: 28px; text-align: center;
  font-size: 14px; font-weight: 700; font-family: var(--font-mono); color: var(--ink);
  background: var(--surface); border: 1px solid var(--line);
  border-radius: 6px; outline: none; padding: 0 4px; transition: border-color .15s;
}
.goal-num-input:focus { border-color: var(--blue); }
.goal-num-input:disabled { opacity: 0.4; cursor: not-allowed; }
.goal-num-input::-webkit-outer-spin-button,
.goal-num-input::-webkit-inner-spin-button { -webkit-appearance: none; }
.goal-num-input[type=number] { -moz-appearance: textfield; }
.goal-unit { font-size: 11px; color: var(--ink-3); }

.goal-toggle { position: relative; display: inline-block; width: 34px; height: 20px; flex-shrink: 0; }
.goal-toggle input { opacity: 0; width: 0; height: 0; }
.goal-toggle-slider {
  position: absolute; inset: 0; background: var(--bg-3);
  border-radius: 99px; cursor: pointer; transition: .2s;
  border: 1px solid var(--line);
}
.goal-toggle-slider::before {
  content: ''; position: absolute;
  width: 14px; height: 14px; left: 2px; top: 2px;
  background: white; border-radius: 50%; transition: .2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.goal-toggle input:checked + .goal-toggle-slider { background: var(--blue-2); border-color: var(--blue-2); }
.goal-toggle input:checked + .goal-toggle-slider::before { transform: translateX(14px); }

.goal-modal-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px; border-top: 1px solid var(--line);
}
.goal-reset-btn { font-size: 12.5px; color: var(--ink-3); cursor: pointer; font-family: var(--font-sans); }
.goal-reset-btn:hover { color: var(--ink); text-decoration: underline; }
.goal-save-btn {
  padding: 8px 20px; border-radius: 8px; border: none;
  background: var(--blue-2); color: white;
  font-size: 13px; font-weight: 600; cursor: pointer;
  font-family: var(--font-sans); transition: opacity .15s;
}
.goal-save-btn:hover { opacity: 0.88; }

.fade-enter-active, .fade-leave-active { transition: opacity .2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
