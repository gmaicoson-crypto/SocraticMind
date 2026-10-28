<template>
  <details class="score-card" :open="initiallyOpen">
    <summary>
      <span class="question-number">{{ index + 1 }}</span>
      <span class="question-heading">
        <strong>第 {{ index + 1 }} 题</strong>
      </span>
      <span class="question-score">{{ points }}<small>/100</small></span>
      <ChevronDown class="expand-icon" :size="16" aria-hidden="true" />
    </summary>
    <div class="score-content">
      <section class="question-context">
        <h5>原题</h5>
        <p>{{ score.question || '该历史记录未保存原题，请重新评估以获取完整解析。' }}</p>
      </section>
      <section class="answer-context">
        <h5>你的回答</h5>
        <p>{{ score.answer || '该历史记录未保存回答内容。' }}</p>
      </section>
      <section class="reference-context">
        <h5>参考答案</h5>
        <p>{{ score.reference_answer || '该历史评估未保存参考答案，可重新评估查看。' }}</p>
        <MaterialEvidence
          v-if="evidence.length"
          :sources="evidence"
          :cited-ids="score.source_ids"
        />
      </section>
      <section>
        <h5>回答解析</h5>
        <p>{{ score.rationale }}</p>
      </section>
      <section v-if="score.mastery_analysis">
        <h5>掌握情况</h5>
        <p>{{ score.mastery_analysis }}</p>
      </section>
      <section v-if="score.suggestions?.length" class="question-advice">
        <h5>改进建议</h5>
        <ul>
          <li v-for="(suggestion, suggestionIndex) in score.suggestions" :key="suggestionIndex">
            {{ suggestion }}
          </li>
        </ul>
      </section>
    </div>
  </details>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ChevronDown } from '@lucide/vue'
import type { AssessmentScoreItem } from '../../types/learningAgent'
import type { FileSource } from '../../types/webSearch'
import MaterialEvidence from './MaterialEvidence.vue'

const props = defineProps<{
  score: AssessmentScoreItem
  index: number
  maxScore: number
  initiallyOpen?: boolean
  sources?: FileSource[]
}>()
const points = computed(() => Math.round((props.score.score / props.maxScore) * 100))
const evidence = computed(() =>
  (props.sources ?? []).filter((source) => props.score.source_ids?.includes(source.id)),
)
</script>

<style scoped>
.score-card {
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  overflow: hidden;
}
summary {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px;
  cursor: pointer;
  list-style: none;
}
summary::-webkit-details-marker {
  display: none;
}
summary:focus-visible {
  outline: 2px solid var(--assessment-accent);
  outline-offset: -3px;
}
.question-number {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--bg-2);
  color: var(--assessment-accent);
  font-family: var(--font-mono);
  font-size: 13px;
}
.question-heading {
  flex: 1;
  min-width: 0;
}
.question-heading strong {
  font-size: 14px;
}
.question-score {
  flex-shrink: 0;
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 20px;
  font-weight: 650;
}
.question-score small {
  margin-left: 3px;
  color: var(--ink-3);
  font-size: 12px;
  font-weight: 400;
}
.expand-icon {
  flex-shrink: 0;
  color: var(--ink-3);
}
.score-card[open] .expand-icon {
  transform: rotate(180deg);
}
.score-content {
  display: grid;
  gap: 20px;
  padding: 0 20px 22px;
}
.score-content section {
  display: grid;
  gap: 8px;
  min-width: 0;
}
h5 {
  margin: 0;
  color: var(--ink);
  font-size: 13px;
  font-weight: 650;
}
p,
ul {
  margin: 0;
  color: var(--ink-2);
  font-size: 13px;
  line-height: 1.85;
  overflow-wrap: anywhere;
}
p {
  white-space: pre-wrap;
}
ul {
  display: grid;
  gap: 8px;
  padding-left: 18px;
  list-style: disc;
}
.question-context,
.answer-context,
.reference-context {
  padding: 14px 16px;
  border-radius: 8px;
  background: var(--bg);
}
.answer-context {
  border-left: 2px solid var(--blue-2);
}
.reference-context {
  border-left: 2px solid var(--success-strong);
  background: var(--success-muted-bg);
}
.question-advice {
  padding-top: 16px;
  border-top: 1px solid var(--line);
}
@media (max-width: 580px) {
  summary {
    gap: 8px;
    padding: 14px;
  }
  .score-content {
    padding: 0 14px 18px;
  }
}
</style>
