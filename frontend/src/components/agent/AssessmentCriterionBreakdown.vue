<template>
  <article class="criterion-breakdown">
    <header>
      <strong>{{ criterion.criterion }}</strong>
      <span>{{
        criterion.max_score === undefined ? '未记录分值' : `满分 ${criterion.max_score} 分`
      }}</span>
    </header>
    <template v-if="criterion.max_score !== undefined && criterion.scoring_rules?.length">
      <div v-if="award" class="criterion-award">
        <strong>实得 {{ award.score }} 分</strong>
        <span>扣 {{ criterion.max_score - award.score }} 分</span>
      </div>
      <p v-if="award" class="award-rationale">本次评分依据：{{ award.rationale }}</p>
      <p v-else class="legacy-notice">该记录未保存本维度的实际得分。</p>
      <h6>得分与扣分规则</h6>
      <ul class="scoring-bands">
        <li
          v-for="rule in sortedRules"
          :key="rule.score"
          :class="{ applied: award?.score === rule.score }"
        >
          <div>
            <strong>得 {{ rule.score }} 分</strong>
            <span>扣 {{ criterion.max_score - rule.score }} 分</span>
            <span v-if="award?.score === rule.score" class="applied-label">本次适用</span>
          </div>
          <p>{{ rule.description }}</p>
        </li>
      </ul>
    </template>
    <template v-else>
      <ul class="legacy-standards">
        <li v-for="(standard, index) in criterion.observable_standards" :key="index">
          {{ standard }}
        </li>
      </ul>
      <p class="legacy-notice">历史评估未记录该维度的分值与扣分明细，重新评估后可查看。</p>
    </template>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AssessmentCriterionScore, AssessmentRubricCriterion } from '../../types/learningAgent'

const props = defineProps<{
  criterion: AssessmentRubricCriterion
  award?: AssessmentCriterionScore
}>()
const sortedRules = computed(() =>
  [...(props.criterion.scoring_rules ?? [])].sort((a, b) => b.score - a.score),
)
</script>

<style scoped>
.criterion-breakdown + .criterion-breakdown {
  margin-top: 20px;
  padding-top: 18px;
  border-top: 1px solid var(--line);
}
header,
.criterion-award,
.scoring-bands li > div {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px 12px;
}
header {
  justify-content: space-between;
}
header > strong {
  font-size: 13px;
}
header > span,
.criterion-award > span,
.scoring-bands li > div > span {
  color: var(--ink-3);
  font-size: 11px;
}
.criterion-award {
  margin-top: 10px;
  font-size: 12px;
}
.criterion-award > strong {
  color: var(--assessment-accent, var(--ink));
}
p,
.legacy-standards {
  margin: 8px 0 0;
  color: var(--ink-2);
  font-size: 12px;
  line-height: 1.8;
  overflow-wrap: anywhere;
}
.legacy-notice {
  color: var(--ink-3);
}
h6 {
  margin: 14px 0 8px;
  font-size: 12px;
  font-weight: 600;
}
.scoring-bands {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.scoring-bands > li {
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface);
}
.scoring-bands strong {
  font-size: 12px;
}
.scoring-bands > .applied {
  border-color: var(--assessment-accent, var(--line-2));
  background: var(--blue-tint);
}
.scoring-bands li > div > .applied-label {
  color: var(--assessment-accent, var(--ink));
}
.scoring-bands p {
  margin-top: 5px;
}
.legacy-standards {
  padding-left: 18px;
  list-style: disc;
}
</style>
