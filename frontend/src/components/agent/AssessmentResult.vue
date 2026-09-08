<template>
  <section class="assessment-result">
    <header class="result-header">
      <div>
        <p>{{ result.passed ? '评估通过' : '评估完成' }}</p>
        <h3>{{ result.node_label }}</h3>
      </div>
      <strong>{{ result.total_score }}/12</strong>
    </header>

    <dl class="result-summary">
      <div><dt>置信度</dt><dd>{{ confidence }}%</dd></div>
      <div><dt>关键误解</dt><dd>{{ result.critical_misconception ? '存在' : '未发现' }}</dd></div>
      <div><dt>通过条件</dt><dd>≥ {{ result.threshold.minimum_score }}/12，置信度 ≥ {{ Math.round(result.threshold.minimum_confidence * 100) }}%</dd></div>
    </dl>

    <p class="evidence">{{ result.evidence }}</p>
    <div v-if="result.professional_review_required" class="review-notice">该实操能力需要专业人员复核，本次不会自动标记掌握。</div>
    <div v-if="result.weaknesses.length" class="weaknesses">
      <strong>需要加强</strong>
      <span>{{ result.weaknesses.join('、') }}</span>
    </div>

    <ol class="score-list">
      <li v-for="score in result.scores" :key="score.question_id">
        <span>{{ score.question_id }} · {{ score.score }}/4</span>
        <p>{{ score.rationale }}</p>
      </li>
    </ol>

    <div class="result-actions">
      <BaseButton @click="emit('continue')">继续学习</BaseButton>
      <BaseButton v-if="result.passed" :disabled="busy" @click="emit('revert')">撤销掌握</BaseButton>
      <BaseButton v-else class="primary" :disabled="busy" @click="emit('retry')">重新评估</BaseButton>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AssessmentResult } from '../../types/learningAgent'
import BaseButton from '../ui/BaseButton.vue'

const props = withDefaults(defineProps<{ result: AssessmentResult; busy?: boolean }>(), { busy: false })
const emit = defineEmits<{ continue: []; retry: []; revert: [] }>()
const confidence = computed(() => Math.round(props.result.evaluation_confidence * 100))
</script>

<style scoped>
.assessment-result { display: grid; gap: 14px; width: min(100%, 720px); align-self: center; padding: 17px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); }
.result-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
.result-header p { margin: 0 0 3px; color: var(--blue-2); font-size: 10px; font-weight: 700; }
.result-header h3 { margin: 0; font-size: 16px; overflow-wrap: anywhere; }
.result-header > strong { font-size: 22px; font-family: var(--font-mono); }
.result-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; margin: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 6px; background: var(--line); }
.result-summary div { min-width: 0; padding: 8px; background: var(--bg); }
dt { color: var(--ink-3); font-size: 10px; } dd { margin: 3px 0 0; font-size: 11px; overflow-wrap: anywhere; }
.evidence, .weaknesses, .review-notice { margin: 0; font-size: 11.5px; line-height: 1.6; overflow-wrap: anywhere; }
.weaknesses { display: grid; gap: 3px; }
.weaknesses span, .evidence { color: var(--ink-2); }
.review-notice { padding: 8px 10px; border-radius: 6px; background: color-mix(in srgb, #d97706 10%, var(--surface)); color: #92400e; }
.score-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.score-list li { padding-top: 8px; border-top: 1px solid var(--line); }
.score-list span { font-size: 11px; font-weight: 650; }
.score-list p { margin: 4px 0 0; color: var(--ink-2); font-size: 11px; line-height: 1.55; overflow-wrap: anywhere; }
.result-actions { display: flex; justify-content: flex-end; gap: 8px; }
.result-actions :deep(.ui-button) { min-height: 32px; padding: 0 11px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg-2); color: var(--ink-2); cursor: pointer; }
.result-actions :deep(.primary) { border-color: var(--blue-2); background: var(--blue-2); color: white; }
@media (max-width: 580px) { .result-summary { grid-template-columns: minmax(0, 1fr); } }
</style>
