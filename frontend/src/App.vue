<template>
  <RouterView />
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router'
import { onMounted } from 'vue'
import { useLearningStore } from './stores/learning'

const store = useLearningStore()

onMounted(async () => {
  store.loadUserFromStorage()
  const token = localStorage.getItem('sm_token')
  if (token) {
    await store.fetchTopics()
    // recordLearning 内部先 POST 今日记录再 GET streak；必须 await，否则
    // 其它组件并发读 streak 会拿到过期值（先前曾导致首页连续天数与 Profile 不一致）
    await store.recordLearning()
  }
})
</script>