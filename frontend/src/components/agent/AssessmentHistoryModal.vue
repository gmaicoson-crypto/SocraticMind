<template>
  <AssessmentResultModal title="历史评估结果" @continue="emit('close')">
    <div ref="browserRef" class="assessment-history">
      <div class="history-toolbar">
        <div>
          <h3>{{ nodeLabel }}</h3>
          <p v-if="selected"><TimeDisplay :value="selected.assessed_at" /></p>
          <p v-else>按评估记录按时间顺序排列</p>
        </div>
        <BaseButton v-if="selected" class="history-control history-back" @click="backToList">
          返回记录列表
        </BaseButton>
      </div>

      <AssessmentResult v-if="detail" :result="detail" read-only @continue="emit('close')" />
      <div v-else-if="selected" class="history-state">
        <p v-if="detailLoading" role="status">正在加载评估详情…</p>
        <div v-if="detailError" role="alert">
          <p>{{ detailError }}</p>
          <BaseButton class="history-control" @click="openRecord(selected)">重试详情</BaseButton>
        </div>
      </div>
      <div v-else class="history-list-view">
        <div ref="listRef" class="history-list-page" :aria-busy="loading">
          <p v-if="loading" role="status">正在加载评估记录…</p>
          <p v-else-if="!items.length && !listError" role="status">
            当前节点暂无已完成的评估记录。
          </p>
          <ol v-if="items.length" class="history-list" aria-label="当前节点的历史评估记录">
            <li v-for="item in items" :key="item.id">
              <button
                type="button"
                class="history-record"
                :data-assessment-id="item.id"
                :disabled="loading"
                @click="openRecord(item)"
              >
                <TimeDisplay :value="item.assessed_at" />
                <strong>{{ points(item) }}<span>/100</span></strong>
                <span class="history-status" :class="{ passed: item.passed }">
                  {{ item.passed ? '评估通过' : '未通过' }}
                </span>
                <span class="history-record-action"
                  >查看详情<ChevronRight :size="14" aria-hidden="true"
                /></span>
              </button>
            </li>
          </ol>
          <div v-if="listError" class="history-error" role="alert">
            <p>{{ listError }}</p>
            <BaseButton class="history-control" @click="loadPage(requestedPage)"
              >重试加载</BaseButton
            >
          </div>
        </div>
        <nav v-if="hasLoaded" class="history-pagination" aria-label="历史评估记录分页">
          <p class="history-page-summary" aria-live="polite">
            共 {{ total }} 条记录，共 {{ totalPages }} 页
          </p>
          <div class="history-page-controls">
            <IconButton
              class="history-control history-page-arrow history-previous"
              label="上一页"
              :disabled="loading || currentPage <= 1"
              @click="changePage(currentPage - 1)"
            >
              <ChevronLeft :size="16" aria-hidden="true" />
            </IconButton>
            <template v-for="number in pageNumbers" :key="number">
              <BaseButton
                v-if="typeof number === 'number'"
                class="history-control history-page-number"
                :data-page="number"
                :aria-label="`第 ${number} 页`"
                :aria-current="number === currentPage ? 'page' : undefined"
                :disabled="loading"
                @click="changePage(number)"
                >{{ number }}</BaseButton
              >
              <span v-else class="history-page-ellipsis" aria-hidden="true">…</span>
            </template>
            <IconButton
              class="history-control history-page-arrow history-next"
              label="下一页"
              :disabled="loading || currentPage >= totalPages"
              @click="changePage(currentPage + 1)"
            >
              <ChevronRight :size="16" aria-hidden="true" />
            </IconButton>
          </div>
        </nav>
      </div>
    </div>
  </AssessmentResultModal>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import { getAgentRun, getNodeAssessmentHistory } from '../../api/agent'
import { parseApiError } from '../../api'
import type { AssessmentHistoryItem, AssessmentResult as Result } from '../../types/learningAgent'
import BaseButton from '../ui/BaseButton.vue'
import IconButton from '../ui/IconButton.vue'
import TimeDisplay from '../ui/TimeDisplay.vue'
import AssessmentResultModal from './AssessmentResultModal.vue'
import AssessmentResult from './AssessmentResult.vue'

const props = defineProps<{ nodeId: number; nodeLabel: string }>()
const emit = defineEmits<{ close: [] }>()
const browserRef = ref<HTMLElement | null>(null)
const listRef = ref<HTMLElement | null>(null)
const items = shallowRef<AssessmentHistoryItem[]>([])
const currentPage = ref(1)
const requestedPage = ref(1)
const total = ref(0)
const totalPages = ref(0)
const hasLoaded = ref(false)
const loading = ref(false)
const listError = ref('')
const selected = shallowRef<AssessmentHistoryItem | null>(null)
const detail = shallowRef<Result | null>(null)
const detailLoading = ref(false)
const detailError = ref('')
let listEpoch = 0
let detailEpoch = 0

const pageNumbers = computed(() => {
  const count = totalPages.value
  if (count <= 7) return Array.from({ length: count }, (_, index) => index + 1)
  const start = currentPage.value >= count - 2 ? count - 3 : Math.max(2, currentPage.value - 1)
  const end = currentPage.value <= 3 ? 4 : Math.min(count - 1, currentPage.value + 1)
  const numbers: (number | string)[] = [1]
  if (start > 2) numbers.push('before')
  for (let page = start; page <= end; page += 1) numbers.push(page)
  if (end < count - 1) numbers.push('after')
  numbers.push(count)
  return numbers
})

function points(item: AssessmentHistoryItem) {
  return item.total_score === null ? '—' : Math.round((item.total_score / item.max_score) * 100)
}

async function loadPage(target: number) {
  if (loading.value) return
  const epoch = ++listEpoch
  const focusPage = hasLoaded.value
  requestedPage.value = target
  loading.value = true
  listError.value = ''
  try {
    const page = await getNodeAssessmentHistory(props.nodeId, target)
    if (epoch !== listEpoch) return
    items.value = page.items
    currentPage.value = page.page
    total.value = page.total
    totalPages.value = page.total_pages
    hasLoaded.value = true
    nextTick(() => {
      if (epoch !== listEpoch) return
      if (listRef.value) listRef.value.scrollTop = 0
      if (focusPage)
        browserRef.value?.querySelector<HTMLButtonElement>(`[data-page="${page.page}"]`)?.focus()
    })
  } catch (cause) {
    if (epoch === listEpoch) listError.value = parseApiError(cause).message
  } finally {
    if (epoch === listEpoch) loading.value = false
  }
}

function changePage(page: number) {
  if (page < 1 || page > totalPages.value || page === currentPage.value) return
  void loadPage(page)
}

async function openRecord(item: AssessmentHistoryItem) {
  const epoch = ++detailEpoch
  selected.value = item
  detail.value = null
  detailError.value = ''
  detailLoading.value = true
  nextTick(() => browserRef.value?.querySelector<HTMLButtonElement>('.history-back')?.focus())
  try {
    // Read directly without restoring the agent store or reopening the completion popup.
    const run = await getAgentRun(item.run_id)
    if (epoch !== detailEpoch) return
    if (
      run.type !== 'assessment' ||
      !run.result ||
      !('scores' in run.result) ||
      run.result.node_id !== props.nodeId
    )
      throw new Error('这条评估记录暂时无法查看，请重试。')
    detail.value = run.result as Result
  } catch (cause) {
    if (epoch === detailEpoch) detailError.value = parseApiError(cause).message
  } finally {
    if (epoch === detailEpoch) detailLoading.value = false
  }
}

function backToList() {
  const id = selected.value?.id
  detailEpoch += 1
  selected.value = null
  detail.value = null
  detailError.value = ''
  detailLoading.value = false
  nextTick(() =>
    browserRef.value?.querySelector<HTMLButtonElement>(`[data-assessment-id="${id}"]`)?.focus(),
  )
}

watch(
  () => props.nodeId,
  () => {
    listEpoch += 1
    detailEpoch += 1
    items.value = []
    currentPage.value = 1
    requestedPage.value = 1
    total.value = 0
    totalPages.value = 0
    hasLoaded.value = false
    selected.value = null
    detail.value = null
    detailError.value = ''
    detailLoading.value = false
    loading.value = false
    void loadPage(1)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  listEpoch += 1
  detailEpoch += 1
})
</script>

<style scoped>
.assessment-history {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  color: var(--ink);
}
.history-toolbar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 26px;
  border-bottom: 1px solid var(--line);
}
.history-toolbar h3 {
  margin: 0 0 6px;
  font-size: 16px;
  overflow-wrap: anywhere;
}
.history-toolbar p,
.history-page-summary {
  margin: 0;
  color: var(--ink-3);
  font-size: 12px;
}
.history-list-view {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}
.history-list-page,
.history-state {
  flex: 1;
  min-height: 0;
  padding: 20px 26px;
  overflow-y: auto;
}
.history-list {
  display: grid;
  gap: 12px;
  margin: 0 0 20px;
  padding: 0;
  list-style: none;
}
.history-record {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.history-record:hover,
.history-record:focus-visible {
  border-color: var(--blue-2);
  background: var(--blue-tint);
}
.history-record time {
  color: var(--ink-2);
  font-size: 13px;
}
.history-record strong {
  font-size: 20px;
}
.history-record strong span {
  color: var(--ink-3);
  font-size: 12px;
}
.history-status {
  color: var(--ink-3);
  font-size: 12px;
}
.history-status.passed {
  color: var(--success-strong);
}
.history-record-action {
  display: inline-flex;
  align-items: center;
  color: var(--blue-2);
  font-size: 12px;
}
.history-control {
  min-height: 30px;
  padding: 5px 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--bg-2);
  color: var(--ink-2);
  cursor: pointer;
  font-size: 12px;
}
.history-back {
  flex-shrink: 0;
}
.history-error {
  color: var(--danger-strong);
}
.history-pagination {
  display: grid;
  flex-shrink: 0;
  justify-items: center;
  gap: 10px;
  padding: 14px 26px;
  border-top: 1px solid var(--line);
}
.history-page-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.history-page-number {
  min-width: 30px;
}
.history-page-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
}
.history-page-number[aria-current='page'] {
  border-color: var(--blue-2);
  background: var(--blue-tint);
  color: var(--blue-2);
}
.history-page-ellipsis {
  color: var(--ink-3);
}
.history-control:disabled,
.history-record:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
@media (max-width: 580px) {
  .history-toolbar,
  .history-list-page,
  .history-state,
  .history-pagination {
    padding: 16px;
  }
}
</style>
