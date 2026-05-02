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
    // recordLearning 内部会先 POST 今日学习记录，再调用 fetchStreak，
    // 必须 await 以避免与其他 streak 读取竞速导致拿到过期值
    await store.recordLearning()
  }
})
</script>