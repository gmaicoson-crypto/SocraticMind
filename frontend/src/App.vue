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
  if (token) await store.fetchTopics()
})
</script>