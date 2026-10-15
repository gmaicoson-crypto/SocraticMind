<template>
  <div ref="rootRef" class="scoring-guide" @keydown.esc="onEscape" @focusout="onFocusOut">
    <IconButton
      class="scoring-guide-trigger"
      label="查看评分标准细则"
      :disabled="disabled"
      :aria-expanded="open"
      :aria-controls="panelId"
      aria-haspopup="dialog"
      @click="toggle"
    >
      <CircleHelp :size="18" aria-hidden="true" />
    </IconButton>
    <section
      v-if="open"
      :id="panelId"
      ref="panelRef"
      class="scoring-guide-panel"
      :style="{ maxHeight: `${panelHeight}px` }"
      role="dialog"
      aria-label="评分标准细则"
      tabindex="-1"
    >
      <header class="guide-heading">
        <h4>评分标准细则</h4>
        <IconButton label="关闭评分标准细则" @click="close(true)">
          <X :size="16" aria-hidden="true" />
        </IconButton>
      </header>
      <div class="guide-content">
        <section class="scoring-rule" aria-label="评分规则">
          <h5>百分制评分 · 通过线 {{ minimumPoints }} 分</h5>
          <p>每题满分 100 分，各维度得分相加得到单题分数；三题等权，总分取平均值并四舍五入。</p>
          <p v-if="result.scoring_version === 2" class="overall-calculation">
            总分计算：({{ result.scores.map(questionPoints).join(' + ') }}) ÷
            {{ result.scores.length }}，四舍五入后为
            {{ Math.round((result.total_score / (result.max_score ?? 12)) * 100) }}/100。
          </p>
          <p>
            总分 ≥ {{ minimumPoints }}/100
            <template v-if="result.professional_review_required"
              >达到分数要求，该实操能力仍需专业人员复核。</template
            ><template v-else>即通过。</template>
          </p>
          <p>单题低于 {{ minimumPoints }} 分的题目会加入复习计划。</p>
          <p v-if="result.max_score === undefined" class="legacy-notice">
            历史结果保留原评估结论；重新评估将使用当前通过标准。
          </p>
        </section>
        <section class="rubric-section">
          <h5>逐题评分依据</h5>
          <p v-if="result.scoring_version === 2" class="rubric-description">
            维度和分值在作答前确定；每个维度按符合条件的一档计分，扣分为该维度满分减去实得分。
          </p>
          <p v-else class="legacy-notice">
            历史评估未记录完整的维度分值与分项得分，以下保留原评分要求；重新评估后可查看完整明细。
          </p>
          <details
            v-for="(score, index) in result.scores"
            :key="score.question_id"
            :open="index === 0"
            class="rubric-item"
          >
            <summary>
              第 {{ index + 1 }} 题<span>{{ questionPoints(score) }}/100</span
              ><ChevronDown :size="14" aria-hidden="true" />
            </summary>
            <div class="rubric-content">
              <template v-if="score.rubric?.length">
                <AssessmentCriterionBreakdown
                  v-for="(criterion, criterionIndex) in score.rubric"
                  :key="criterion.criterion_id ?? criterionIndex"
                  :criterion="criterion"
                  :award="
                    criterion.criterion_id
                      ? score.criterion_scores?.find(
                          (item) => item.criterion_id === criterion.criterion_id,
                        )
                      : undefined
                  "
                />
                <p v-if="score.criterion_scores?.length" class="question-subtotal">
                  维度合计：{{ criterionPoints(score) }} = {{ questionPoints(score) }}/100
                </p>
              </template>
              <p v-else class="legacy-notice">该历史记录未保存本题评分量规，可重新评估查看。</p>
            </div>
          </details>
        </section>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'
import { ChevronDown, CircleHelp, X } from '@lucide/vue'
import type { AssessmentResult, AssessmentScoreItem } from '../../types/learningAgent'
import IconButton from '../ui/IconButton.vue'
import AssessmentCriterionBreakdown from './AssessmentCriterionBreakdown.vue'

const props = withDefaults(defineProps<{ result: AssessmentResult; disabled?: boolean }>(), {
  disabled: false,
})
const panelId = useId()
const rootRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const open = ref(false)
const panelHeight = ref(0)
const minimumPoints = computed(() =>
  Math.round((props.result.threshold.minimum_score / (props.result.max_score ?? 12)) * 100),
)

function questionPoints(score: AssessmentScoreItem) {
  return Math.round(
    (score.score / (score.max_score ?? (props.result.max_score === 100 ? 100 : 4))) * 100,
  )
}

function criterionPoints(score: AssessmentScoreItem) {
  return score.rubric
    ?.map(
      (criterion) =>
        score.criterion_scores?.find((item) => item.criterion_id === criterion.criterion_id)?.score,
    )
    .join(' + ')
}

function measure() {
  const anchor = rootRef.value?.getBoundingClientRect()
  if (!anchor) return
  const boundary = rootRef.value?.closest('.assessment-result')?.getBoundingClientRect()
  const bottom = Math.min(window.innerHeight - 16, boundary?.bottom ?? window.innerHeight)
  panelHeight.value = Math.max(0, Math.min(window.innerHeight * 0.7, bottom - anchor.bottom - 20))
}

function close(restoreFocus = false) {
  if (!open.value) return
  open.value = false
  if (restoreFocus)
    rootRef.value?.querySelector<HTMLButtonElement>('.scoring-guide-trigger')?.focus()
}

async function toggle() {
  if (props.disabled) return
  if (open.value) return close(true)
  measure()
  open.value = true
  await nextTick()
  panelRef.value?.focus()
}

function onEscape(event: KeyboardEvent) {
  if (!open.value) return
  event.stopPropagation()
  event.preventDefault()
  close(true)
}

function onFocusOut(event: FocusEvent) {
  if (event.relatedTarget instanceof Node && !rootRef.value?.contains(event.relatedTarget)) close()
}

watch(open, (isOpen, _previous, onCleanup) => {
  if (!isOpen) return
  const onOutsidePointerDown = (event: PointerEvent) => {
    if (event.target instanceof Node && !rootRef.value?.contains(event.target)) close()
  }
  document.addEventListener('pointerdown', onOutsidePointerDown, true)
  window.addEventListener('resize', measure)
  onCleanup(() => {
    document.removeEventListener('pointerdown', onOutsidePointerDown, true)
    window.removeEventListener('resize', measure)
  })
})
watch([() => props.result, () => props.disabled], () => close())
</script>

<style scoped>
.scoring-guide {
  position: relative;
  flex-shrink: 0;
}
.scoring-guide :deep(.ui-icon-button) {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--ink-3);
  cursor: pointer;
}
.scoring-guide :deep(.ui-icon-button:hover:not(:disabled)),
.scoring-guide :deep([aria-expanded='true']) {
  background: var(--bg-3);
  color: var(--ink);
}
.scoring-guide :deep(.ui-icon-button:focus-visible),
summary:focus-visible {
  outline: 2px solid var(--assessment-accent);
  outline-offset: 2px;
}
.scoring-guide :deep(.ui-icon-button:disabled) {
  opacity: 0.5;
  cursor: not-allowed;
}
.scoring-guide-panel {
  position: absolute;
  z-index: 5;
  top: calc(100% + 8px);
  right: 0;
  width: min(520px, calc(100vw - 80px));
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--line-2);
  border-radius: 12px;
  background: var(--surface-raised, var(--surface));
  box-shadow: var(--dropdown-shadow);
  color: var(--ink);
  text-align: left;
  outline: none;
}
.guide-heading {
  position: sticky;
  z-index: 1;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--line);
  background: var(--surface-raised, var(--surface));
}
h4,
h5 {
  margin: 0;
  color: var(--ink);
  font-size: 14px;
  font-weight: 650;
}
h5 {
  font-size: 13px;
}
.guide-content {
  display: grid;
  gap: 20px;
  padding: 18px;
}
p,
li {
  font-size: 12px;
  line-height: 1.8;
  overflow-wrap: anywhere;
}
p {
  margin: 8px 0 0;
  color: var(--ink-2);
}
.legacy-notice,
.rubric-description {
  color: var(--ink-3);
}
.rubric-item {
  margin-top: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg);
}
summary {
  position: sticky;
  z-index: 1;
  top: 53px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  list-style: none;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border-radius: 8px;
  background: var(--bg);
}
summary > span {
  margin-left: auto;
  color: var(--ink-3);
  font-size: 12px;
  font-family: var(--font-mono);
}
summary::-webkit-details-marker {
  display: none;
}
.rubric-item[open] summary svg {
  transform: rotate(180deg);
}
.rubric-content {
  padding: 0 12px 14px;
}
.question-subtotal {
  margin-top: 18px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
  color: var(--ink);
  font-family: var(--font-mono);
}
</style>
