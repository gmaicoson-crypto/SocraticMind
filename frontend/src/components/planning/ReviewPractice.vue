<template>
  <section class="review-practice" aria-label="错题复习">
    <p v-if="loading" role="status">正在加载复习题…</p>
    <template v-else-if="detail">
      <h3>{{ detail.node_label }} · 错题复习</h3>
      <template v-if="!result && detail.status === 'pending'">
        <AgentStepMessage
          :step="detail.step"
          kind="review"
          :busy="busy"
          @answer="answer = $event"
          @cancel="emit('close')"
        />
        <details>
          <summary>查看上次回答与反馈</summary>
          <p>{{ detail.previous_answer }}</p>
          <p>{{ detail.feedback }}</p>
        </details>
        <form @submit.prevent="submit">
          <label :for="`review-answer-${reviewId}`">重新回答</label>
          <textarea
            :id="`review-answer-${reviewId}`"
            v-model="answer"
            :disabled="busy"
            maxlength="10000"
            rows="4"
            required
          />
          <BaseButton type="submit" :loading="busy" :disabled="busy || !answer.trim()">
            <template #loading>正在评分</template>
            提交复习
          </BaseButton>
        </form>
      </template>
      <div v-else role="status">
        <strong>{{
          result?.passed || detail.status === 'resolved' ? '复习通过' : '继续巩固'
        }}</strong>
        <template v-if="result">
          <p>
            {{ result.score }}/4 · 评分置信度 {{ Math.round(result.evaluation_confidence * 100) }}%
          </p>
          <p>{{ result.rationale }}</p>
          <p v-if="!result.passed">下次复习：{{ result.next_due_date }}</p>
        </template>
        <BaseButton @click="emit('close')">返回今日计划</BaseButton>
      </div>
    </template>
    <div v-if="error" role="alert">
      <p>{{ error.message }}</p>
      <BaseButton
        v-if="!detail || error.code === 'REVIEW_STATE_CONFLICT'"
        :disabled="busy"
        @click="load"
        >刷新复习题</BaseButton
      >
    </div>
    <BaseButton v-if="!detail && !busy" @click="emit('close')">返回今日计划</BaseButton>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref, shallowRef } from 'vue'
import { answerReview, getReview } from '../../api/reviews'
import { parseApiError, type ApiProblem } from '../../api'
import type { ReviewDetail, ReviewResult } from '../../types/learningAgent'
import { createRequestId } from '../../utils/requestId'
import AgentStepMessage from '../agent/AgentStepMessage.vue'
import BaseButton from '../ui/BaseButton.vue'

const props = defineProps<{ reviewId: number; timezone: string }>()
const emit = defineEmits<{ close: []; completed: [] }>()
const detail = shallowRef<ReviewDetail | null>(null)
const result = shallowRef<ReviewResult | null>(null)
const error = shallowRef<ApiProblem | null>(null)
const answer = ref('')
const busy = ref(false)
const loading = ref(false)
let submission: { request_id: string; version: number; answer: string; timezone: string } | null =
  null

async function load() {
  if (loading.value || busy.value) return
  loading.value = true
  error.value = null
  try {
    detail.value = await getReview(props.reviewId)
    submission = null
  } catch (cause) {
    error.value = parseApiError(cause)
  } finally {
    loading.value = false
  }
}

async function submit() {
  if (busy.value || !detail.value || !answer.value.trim()) return
  const text = answer.value.trim()
  // Reuse the request after a lost response; edits create a new intent.
  if (!submission || submission.answer !== text || submission.version !== detail.value.version) {
    submission = {
      request_id: createRequestId('review'),
      version: detail.value.version,
      answer: text,
      timezone: props.timezone,
    }
  }
  busy.value = true
  error.value = null
  try {
    result.value = await answerReview(props.reviewId, submission)
    emit('completed')
  } catch (cause) {
    error.value = parseApiError(cause)
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.review-practice {
  padding: 12px;
  margin-top: 12px;
  border: 1px solid var(--blue-line);
  border-radius: 8px;
  background: var(--bg);
  font-size: 12px;
}
h3 {
  margin-top: 0;
  font-size: 14px;
}
p {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.6;
}
form {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}
textarea {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
}
details {
  margin-top: 12px;
  color: var(--ink-2);
}
summary {
  cursor: pointer;
}
:deep(.agent-tool) {
  box-sizing: border-box;
  width: 100%;
}
:deep(.ui-button) {
  min-height: 32px;
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--bg-2);
  color: var(--ink);
  cursor: pointer;
}
[role='alert'] {
  color: var(--danger-strong);
}
</style>
