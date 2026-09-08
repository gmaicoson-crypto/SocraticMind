<template>
  <section class="mastery-tool">
    <div class="mastery-copy">
      <div>
        <p>当前知识节点</p>
        <h3>{{ node.label }}</h3>
      </div>
      <span :class="['state-badge', node.state]">{{ stateLabel }}</span>
    </div>
    <p v-if="node.sub" class="node-sub">{{ node.sub }}</p>

    <div v-if="node.state === 'mastered'" class="mastery-evidence">
      <span>掌握来源</span>
      <strong>{{ sourceLabel }}</strong>
      <span v-if="node.masteryConfidence != null">置信度 {{ Math.round(node.masteryConfidence * 100) }}%</span>
    </div>
    <p v-else-if="node.state === 'locked'" class="locked-notice">完成先修节点后即可评估或自报掌握。</p>
    <p v-if="error" class="mastery-error">{{ error }}</p>

    <div class="mastery-actions">
      <template v-if="node.state === 'mastered'">
        <BaseButton :disabled="busy" @click="emit('revert')">撤销掌握</BaseButton>
      </template>
      <template v-else>
        <BaseButton :disabled="busy || node.state === 'locked'" @click="emit('selfReport')">自报掌握</BaseButton>
        <BaseButton class="primary" :disabled="busy || node.state === 'locked'" @click="emit('assess')">开始评估</BaseButton>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { KNode } from '../../types'
import BaseButton from '../ui/BaseButton.vue'

const props = withDefaults(defineProps<{ node: KNode; busy?: boolean; error?: string }>(), {
  busy: false,
  error: '',
})
const emit = defineEmits<{ assess: []; selfReport: []; revert: [] }>()
const stateLabel = computed(() => ({ available: '可学习', locked: '未解锁', mastered: '已掌握' })[props.node.state])
const sourceLabel = computed(() => ({
  assessment: '评估通过', self_reported: '用户自报', legacy: '历史记录',
}[props.node.masterySource ?? 'legacy']))
</script>

<style scoped>
.mastery-tool { display: grid; gap: 10px; width: min(100%, 680px); align-self: center; padding: 15px 16px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); }
.mastery-copy { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.mastery-copy p { margin: 0 0 3px; color: var(--blue-2); font-size: 10px; font-weight: 700; }
.mastery-copy h3 { margin: 0; font-size: 15px; overflow-wrap: anywhere; }
.node-sub, .locked-notice { margin: 0; color: var(--ink-3); font-size: 11.5px; line-height: 1.55; overflow-wrap: anywhere; }
.mastery-error { margin: 0; color: #b91c1c; font-size: 11.5px; overflow-wrap: anywhere; }
.state-badge { flex: 0 0 auto; padding: 4px 7px; border-radius: 5px; background: var(--bg-2); color: var(--ink-2); font-size: 10px; }
.state-badge.available { background: var(--blue-tint); color: var(--blue-2); }
.state-badge.mastered { background: color-mix(in srgb, #16a34a 11%, var(--surface)); color: #15803d; }
.mastery-evidence { display: flex; flex-wrap: wrap; gap: 7px 12px; color: var(--ink-3); font-size: 11px; }
.mastery-evidence strong { color: var(--ink-2); }
.mastery-actions { display: flex; justify-content: flex-end; gap: 8px; }
.mastery-actions :deep(.ui-button) { min-height: 32px; padding: 0 11px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg-2); color: var(--ink-2); cursor: pointer; }
.mastery-actions :deep(.primary) { border-color: var(--blue-2); background: var(--blue-2); color: white; }
</style>
