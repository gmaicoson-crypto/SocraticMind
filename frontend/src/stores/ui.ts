import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const THEME_NAMES = ['light', 'dark'] as const
export type ThemeName = (typeof THEME_NAMES)[number]

function isThemeName(value: string | null): value is ThemeName {
  return value !== null && (THEME_NAMES as readonly string[]).includes(value)
}

function getInitialTheme(): ThemeName {
  const stored = localStorage.getItem('sm_theme')
  if (isThemeName(stored)) return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: ThemeName) {
  const root = document.documentElement
  root.classList.add('theme-switching')
  root.setAttribute('data-theme', theme)
  if (themeSwitchFrame !== null) cancelAnimationFrame(themeSwitchFrame)
  themeSwitchFrame = requestAnimationFrame(() => {
    themeSwitchFrame = requestAnimationFrame(() => {
      root.classList.remove('theme-switching')
      themeSwitchFrame = null
    })
  })
}

let themeSwitchFrame: number | null = null

export const useUiStore = defineStore('ui', () => {
  const theme = ref<ThemeName>(getInitialTheme())
  const isDark = computed(() => theme.value === 'dark')
  applyTheme(theme.value)

  function setTheme(nextTheme: ThemeName) {
    theme.value = nextTheme
    localStorage.setItem('sm_theme', nextTheme)
    applyTheme(nextTheme)
  }

  function toggleTheme() {
    setTheme(isDark.value ? 'light' : 'dark')
  }

  return { theme, isDark, setTheme, toggleTheme }
})
