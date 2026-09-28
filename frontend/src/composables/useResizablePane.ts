import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

export function useResizablePane(containerRef: Ref<HTMLElement | null>) {
  const leftWidth = ref(0)
  const dragging = ref(false)
  const minLeft = 480
  const minRight = 520
  const reservedWidth = 38
  let removeDragListeners: (() => void) | null = null
  let resizeObserver: ResizeObserver | null = null

  function availableWidth() {
    return Math.max(0, (containerRef.value?.clientWidth ?? 0) - reservedWidth)
  }

  function bounds() {
    const available = availableWidth()
    const minimumTotal = minLeft + minRight

    if (available >= minimumTotal) {
      return { min: minLeft, max: available - minRight }
    }

    // When the desktop layout is temporarily narrower than both minimums,
    // keep the divider fixed at a proportional split instead of overflowing.
    const compactLeft = Math.round((available * minLeft) / minimumTotal)
    return { min: compactLeft, max: compactLeft }
  }

  function clampLeftWidth(width: number) {
    const { min, max } = bounds()
    return Math.min(Math.max(width, min), max)
  }

  function initializeWidth() {
    leftWidth.value = clampLeftWidth(Math.round(availableWidth() * 0.45))
  }

  function startDrag(event: MouseEvent) {
    dragging.value = true
    event.preventDefault()
    const startX = event.clientX
    const startWidth = leftWidth.value

    function onMove(moveEvent: MouseEvent) {
      leftWidth.value = clampLeftWidth(startWidth + moveEvent.clientX - startX)
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

  onMounted(() => {
    initializeWidth()
    if (typeof ResizeObserver !== 'undefined' && containerRef.value) {
      resizeObserver = new ResizeObserver(() => {
        leftWidth.value = clampLeftWidth(leftWidth.value)
      })
      resizeObserver.observe(containerRef.value)
    }
  })
  onBeforeUnmount(() => {
    removeDragListeners?.()
    resizeObserver?.disconnect()
  })

  return { leftWidth, dragging, startDrag }
}
