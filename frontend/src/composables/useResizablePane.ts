import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

export function useResizablePane(containerRef: Ref<HTMLElement | null>) {
  const leftWidth = ref(0)
  const dragging = ref(false)
  const minLeft = 320
  const minRight = 380
  const reservedWidth = 38
  let removeDragListeners: (() => void) | null = null

  function availableWidth() {
    return Math.max(0, (containerRef.value?.clientWidth ?? 0) - reservedWidth)
  }

  function initializeWidth() {
    leftWidth.value = Math.round(availableWidth() * 0.45)
  }

  function startDrag(event: MouseEvent) {
    dragging.value = true
    event.preventDefault()
    const startX = event.clientX
    const startWidth = leftWidth.value

    function onMove(moveEvent: MouseEvent) {
      const maxLeft = availableWidth() - minRight
      leftWidth.value = Math.min(
        Math.max(startWidth + moveEvent.clientX - startX, minLeft),
        maxLeft,
      )
    }

    function onUp() {
      dragging.value = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      removeDragListeners = null
    }

    removeDragListeners = onUp
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  onMounted(initializeWidth)
  onBeforeUnmount(() => removeDragListeners?.())

  return { leftWidth, dragging, startDrag }
}
