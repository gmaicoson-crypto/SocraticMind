<template>
  <RouterView />
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router'
import { onMounted } from 'vue'
import { useLearningStore } from './stores/learning'
import { getToken } from './utils/token'

const store = useLearningStore()

onMounted(async () => {
  store.loadUserFromStorage()
  if (getToken()) {
    await store.fetchTopics()
    // 必须先 await recordLearning，确保 streak 数据写入后其他组件才读取，避免数据不一致
    await store.recordLearning()
  }
})
</script>
