<template>
  <RouterView />
</template>

<script setup lang="ts">
// 应用根组件，负责初始化学习记录和全局布局。
import { RouterView } from 'vue-router'
import { onMounted } from 'vue'
import { useLearningStore } from './stores/learning'
import { useModelsStore } from './stores/models'
import { getMe } from './api/auth'
import { getToken, updateUser } from './utils/token'

const store = useLearningStore()
const models = useModelsStore()
store.loadUserFromStorage()

onMounted(async () => {
  if (getToken()) {
    const refreshProfile = getMe()
      .then((user) => {
        store.setUserInfo(user)
        updateUser(user)
      })
      .catch(() => {})
    const syncProgress = store.userInfo?.id
      ? store.recordLearning()
      : refreshProfile.then(() => store.recordLearning())
    await Promise.all([refreshProfile, syncProgress, store.fetchTopics(), models.fetchModels()])
  }
})
</script>
