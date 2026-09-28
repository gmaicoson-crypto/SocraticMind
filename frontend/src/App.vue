<template>
  <RouterView />
</template>

<script setup lang="ts">
// 应用根组件，负责初始化学习记录和全局布局。
import { RouterView } from 'vue-router'
import { onMounted } from 'vue'
import { useLearningStore } from './stores/learning'
import { useModelsStore } from './stores/models'
import { getToken } from './utils/token'

const store = useLearningStore()
const models = useModelsStore()

onMounted(async () => {
  store.loadUserFromStorage()
  if (getToken()) {
    await Promise.all([store.fetchTopics(), models.fetchModels()])

    await store.recordLearning()
  }
})
</script>
