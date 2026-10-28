<template>
  <section class="assessment-result">
    <header class="result-header">
      <div>
        <p>{{ result.passed ? '评估通过' : '评估完成' }}</p>
        <h3>{{ result.node_label }}</h3>
      </div>
      <div class="total-score">
        <strong>{{ totalPoints }}<span>/100</span></strong>
        <AssessmentScoringGuide :result="result" :disabled="busy" />
      </div>
    </header>

    <nav class="result-pages" aria-label="评估结果分页">
      <BaseButton
        :aria-current="page === 1 ? 'page' : undefined"
        :disabled="busy"
        @click="page = 1"
      >
        结果概览
      </BaseButton>
      <BaseButton
        :aria-current="page === 2 ? 'page' : undefined"
        :disabled="busy"
        @click="page = 2"
      >
        评分详情
      </BaseButton>
    </nav>

    <div
      ref="pageContentRef"
      class="result-page"
      :aria-label="page === 1 ? '结果概览' : '评分详情'"
    >
      <p v-if="result.evidence_unavailable" role="status">
        原教材已失效，保留历史评分；请重新选择资料后评估。
      </p>
      <template v-if="page === 1">
        <section class="result-section">
          <h4>评估结论</h4>
          <p class="evidence">{{ result.evidence }}</p>
          <MaterialEvidence v-if="result.sources?.length" :sources="result.sources" />
        </section>
        <section v-if="result.remediation_route?.length" class="result-section remediation">
          <div class="section-heading">
            <h4>查缺补漏路线</h4>
            <span>按顺序练习，逐步补齐</span>
          </div>
          <ol class="remediation-route">
            <li v-for="(step, index) in result.remediation_route" :key="index">
              <span class="route-index">{{ index + 1 }}</span>
              <div>
                <h5>{{ step.title }}</h5>
                <p>{{ step.action }}</p>
                <p class="route-checkpoint">
                  <Check :size="13" aria-hidden="true" />
                  <span>完成标准：{{ step.checkpoint }}</span>
                </p>
              </div>
            </li>
          </ol>
        </section>
        <section v-else-if="result.weaknesses.length" class="result-section weaknesses">
          <h4>需要加强</h4>
          <ul>
            <li v-for="(weakness, index) in result.weaknesses" :key="index">{{ weakness }}</li>
          </ul>
          <p class="legacy-notice">该历史记录未包含补漏路线，可重新评估以获取具体练习建议。</p>
        </section>
        <aside v-if="result.review_count" class="review-plan" aria-label="复习计划已安排">
          <span class="review-plan-icon"><CalendarCheck :size="20" aria-hidden="true" /></span>
          <div>
            <div class="review-plan-heading">
              <h4>薄弱题目已安排复习</h4>
              <span>{{ result.review_count }} 道题</span>
            </div>
            <p>已加入复习计划，巩固后再检验掌握情况。</p>
            <div class="review-plan-location">
              今日计划<ChevronRight :size="13" aria-hidden="true" />今日复习
            </div>
          </div>
        </aside>
        <p v-if="result.professional_review_required" class="review-notice">
          该实操能力需要专业人员复核，本次不会自动标记掌握。
        </p>
      </template>

      <template v-else>
        <section class="result-section">
          <h4>逐题评分</h4>
          <ol class="score-list">
            <li v-for="(score, index) in result.scores" :key="score.question_id">
              <AssessmentScoreCard
                :score="score"
                :index="index"
                :max-score="score.max_score ?? (result.max_score === 100 ? 100 : 4)"
                :initially-open="index === 0"
                :sources="result.sources"
              />
            </li>
          </ol>
        </section>
      </template>
    </div>

    <div class="result-actions">
      <BaseButton :disabled="busy" @click="emit('continue')">继续学习</BaseButton>
      <template v-if="!readOnly">
        <BaseButton v-if="result.passed" :disabled="busy" @click="emit('revert')"
          >撤销掌握</BaseButton
        >
        <BaseButton v-else class="primary" :disabled="busy" @click="emit('retry')"
          >重新评估</BaseButton
        >
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CalendarCheck, Check, ChevronRight } from '@lucide/vue'
import type { AssessmentResult } from '../../types/learningAgent'
import BaseButton from '../ui/BaseButton.vue'
import AssessmentScoreCard from './AssessmentScoreCard.vue'
import AssessmentScoringGuide from './AssessmentScoringGuide.vue'
import MaterialEvidence from './MaterialEvidence.vue'

const props = withDefaults(
  defineProps<{ result: AssessmentResult; busy?: boolean; readOnly?: boolean }>(),
  { busy: false, readOnly: false },
)
const emit = defineEmits<{ continue: []; retry: []; revert: [] }>()
// Old saved results used a 12-point total; the explicit maximum distinguishes new low scores.
const totalPoints = computed(() =>
  Math.round((props.result.total_score / (props.result.max_score ?? 12)) * 100),
)
const page = ref<1 | 2>(1)
const pageContentRef = ref<HTMLElement | null>(null)

watch(
  [() => props.result, page],
  ([result], [previousResult]) => {
    if (result !== previousResult) page.value = 1
    if (pageContentRef.value) pageContentRef.value.scrollTop = 0
  },
  { flush: 'post' },
)
</script>

<style scoped>
.assessment-result {
  --assessment-accent: color-mix(in srgb, var(--blue-2) 65%, var(--ink));
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 22px;
  width: min(100%, 760px);
  min-height: 0;
  min-width: 0;
  align-self: stretch;
  padding: 26px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--ink);
}
.result-header {
  display: flex;
  flex-shrink: 0;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}
.result-header p {
  margin: 0 0 6px;
  color: var(--assessment-accent);
  font-size: 12px;
  font-weight: 700;
}
.result-header h3 {
  margin: 0;
  font-size: 19px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.total-score {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
}
.total-score > strong {
  flex-shrink: 0;
  font-size: 32px;
  line-height: 1.3;
  font-family: var(--font-mono);
}
.total-score > strong > span {
  margin-left: 4px;
  color: var(--ink-3);
  font-size: 15px;
  font-weight: 500;
}
.result-pages {
  display: flex;
  flex-shrink: 0;
  gap: 6px;
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg);
}
.result-pages :deep(.ui-button) {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 38px;
  padding: 8px 12px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--ink-3);
  font-size: 13px;
  cursor: pointer;
}
.result-pages :deep([aria-current='page']) {
  border-color: var(--line);
  background: var(--surface);
  color: var(--ink);
  box-shadow: var(--control-shadow);
}
.result-pages :deep(.ui-button:disabled) {
  cursor: not-allowed;
}
.result-page {
  display: grid;
  flex: 1;
  min-height: 0;
  align-content: start;
  gap: 22px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.result-section {
  display: grid;
  gap: 10px;
}
.result-section h4 {
  margin: 0;
  color: var(--ink);
  font-size: 16px;
  font-weight: 700;
}
.section-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}
.section-heading > span {
  color: var(--ink-3);
  font-size: 11px;
}
.evidence,
.weaknesses ul,
.review-notice,
.legacy-notice {
  margin: 0;
  color: var(--ink-2);
  font-size: 13px;
  line-height: 1.85;
  overflow-wrap: anywhere;
}
.weaknesses ul {
  display: grid;
  gap: 8px;
  margin: 0;
  padding-left: 20px;
  list-style: disc;
}
.legacy-notice {
  color: var(--ink-3);
  font-size: 12px;
}
.remediation-route {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}
.remediation-route li {
  position: relative;
  display: flex;
  gap: 14px;
  padding: 0 0 20px;
}
.remediation-route li:last-child {
  padding-bottom: 0;
}
.remediation-route li:not(:last-child)::before {
  position: absolute;
  top: 28px;
  bottom: 0;
  left: 13px;
  width: 1px;
  background: var(--line);
  content: '';
}
.route-index {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 27px;
  height: 27px;
  border: 1px solid var(--line);
  border-radius: 50%;
  color: var(--assessment-accent);
  background: var(--bg);
  font-size: 12px;
  font-family: var(--font-mono);
}
.remediation-route h5 {
  margin: 3px 0 6px;
  font-size: 13px;
}
.remediation-route p {
  margin: 0;
  color: var(--ink-2);
  font-size: 13px;
  line-height: 1.8;
  overflow-wrap: anywhere;
}
.remediation-route .route-checkpoint {
  display: flex;
  align-items: baseline;
  gap: 5px;
  margin-top: 6px;
  color: var(--ink-3);
  font-size: 12px;
}
.route-checkpoint svg {
  flex-shrink: 0;
  align-self: flex-start;
  margin-top: 4px;
  color: var(--assessment-accent);
}
.review-plan {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--bg);
}
.review-plan-icon {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 1px solid var(--line);
  border-radius: 11px;
  color: var(--assessment-accent);
  background: var(--surface);
}
.review-plan > div {
  flex: 1;
  min-width: 0;
}
.review-plan-heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.review-plan h4 {
  margin: 0;
  font-size: 13px;
}
.review-plan-heading > span {
  padding: 2px 8px;
  border: 1px solid var(--line);
  border-radius: 20px;
  color: var(--assessment-accent);
  font-size: 11px;
}
.review-plan p {
  margin: 8px 0;
  color: var(--ink-3);
  font-size: 12px;
  line-height: 1.7;
}
.review-plan-location {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ink-2);
  font-size: 11px;
}
.review-notice {
  padding: 12px 14px;
  border-radius: 8px;
  background: var(--warning-muted-bg);
  color: var(--warning-ink);
}
.score-list {
  display: grid;
  gap: 14px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.result-actions {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 18px;
  border-top: 1px solid var(--line);
}
.result-actions :deep(.ui-button) {
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--bg-2);
  color: var(--ink-2);
  cursor: pointer;
  font-size: 13px;
}
.result-actions :deep(.primary) {
  border-color: var(--assessment-accent);
  background: var(--blue-2);
  color: var(--on-accent);
}
@media (max-width: 580px) {
  .assessment-result {
    gap: 18px;
    padding: 20px;
  }
  .result-header h3 {
    font-size: 17px;
  }
  .result-actions :deep(.ui-button) {
    flex: 1;
  }
}
</style>
