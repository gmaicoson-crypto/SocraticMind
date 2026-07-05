import { defineStore } from 'pinia'
import { ref } from 'vue'

function getInitialTheme() {
  const stored = localStorage.getItem('sm_theme')
  if (stored !== null) return stored === 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyTheme(dark: boolean) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
}

export const useUiStore = defineStore('ui', () => {
  const isDark = ref(getInitialTheme())
  applyTheme(isDark.value)

  function toggleTheme() {
    isDark.value = !isDark.value
    localStorage.setItem('sm_theme', isDark.value ? 'dark' : 'light')
    applyTheme(isDark.value)
  }

  return { isDark, toggleTheme }
})
