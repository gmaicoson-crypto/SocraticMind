import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { Message } from '../types'

export const useDialogueStore = defineStore('dialogue', () => {
  const messages = shallowRef<Message[]>([])
  const pendingTopicOverviewId = ref<number | null>(null)

  function addMessage(message: Message) {
    messages.value.push(message)
  }

  function requestTopicOverview(topicId: number | null) {
    pendingTopicOverviewId.value = topicId
  }

  return { messages, pendingTopicOverviewId, addMessage, requestTopicOverview }
})
