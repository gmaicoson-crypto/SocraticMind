import { defineStore } from 'pinia'
import { ref } from 'vue'
import { loadUser } from '../utils/token'

export interface UserInfo {
  id: number
  username: string
  email: string
  avatar_grad: string
  avatar_url: string | null
  bio: string
  daily_goal: number
  ai_style: string
}

export const useUserStore = defineStore('user', () => {
  const userInfo = ref<UserInfo | null>(null)

  function setUserInfo(info: UserInfo | null) {
    userInfo.value = info
  }

  function loadUserFromStorage() {
    const data = loadUser()
    if (data) userInfo.value = data as UserInfo
  }

  return { userInfo, setUserInfo, loadUserFromStorage }
})
