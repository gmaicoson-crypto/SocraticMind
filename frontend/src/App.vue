<template>
  <RouterView />
</template>

<script setup lang="ts">
// 应用根组件，负责初始化学习记录和全局布局。
import { RouterView } from 'vue-router'
import { onMounted } from 'vue'
import { useLearningStore } from './stores/learning'
import { getToken } from './utils/token'

const store = useLearningStore()

onMounted(async () => {
  store.loadUserFromStorage()
  if (getToken()) {
    await store.fetchTopics()

    await store.recordLearning()
  }
})
</script>
