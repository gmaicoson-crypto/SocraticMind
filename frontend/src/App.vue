<template>
  <RouterView />
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router'
import { onMounted } from 'vue'
import { useLearningStore } from './stores/learning'

const store = useLearningStore()
onMounted(() => {
  store.loadUserFromStorage()
})

onMounted(async () => {
  store.loadUserFromStorage()
  const token = localStorage.getItem('sm_token')
  if (token) {
    await store.fetchTopics()
    store.recordLearning()  // 登录后记录今日学习
    store.fetchStreak()     // 获取连续天数
  }
})
</script>