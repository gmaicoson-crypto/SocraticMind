import { onBeforeUnmount, onMounted } from 'vue'
import { addStudyMinutes } from '../utils/dailyGoal'

const activeEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const

export function useStudyTimer(userId: () => number | undefined) {
  const inactiveTimeout = 2 * 60 * 1000
  let timer: ReturnType<typeof setInterval> | null = null
  let studySeconds = 0
  let lastActiveAt = Date.now()

  function markActive() {
    lastActiveAt = Date.now()
  }

  function onVisibilityChange() {
    if (!document.hidden) markActive()
  }

  function stopTimer() {
    if (!timer) return
    clearInterval(timer)
    timer = null
    if (studySeconds % 60 >= 30 && userId()) addStudyMinutes(userId()!, 1)
  }

  onMounted(() => {
    markActive()
    timer = setInterval(() => {
      if (Date.now() - lastActiveAt > inactiveTimeout) return
      studySeconds++
      if (studySeconds % 60 === 0 && userId()) addStudyMinutes(userId()!, 1)
    }, 1000)
    document.addEventListener('visibilitychange', onVisibilityChange)
    activeEvents.forEach((event) => window.addEventListener(event, markActive, { passive: true }))
  })

  onBeforeUnmount(() => {
    stopTimer()
    document.removeEventListener('visibilitychange', onVisibilityChange)
    activeEvents.forEach((event) => window.removeEventListener(event, markActive))
  })
}
