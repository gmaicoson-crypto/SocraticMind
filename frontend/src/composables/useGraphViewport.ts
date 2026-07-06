import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

interface GraphViewportOptions {
  width: () => number
  height: () => number
}

export function useGraphViewport(svgRef: Ref<SVGSVGElement | null>, options: GraphViewportOptions) {
  const scale = ref(1)
  const panX = ref(0)
  const panY = ref(0)
  const showScaleHint = ref(false)
  const isDragging = ref(false)
  const dragStart = { x: 0, y: 0 }
  const panStart = { x: 0, y: 0 }
  const minScale = 0.85
  const maxScale = 2.5
  let hintTimer: ReturnType<typeof setTimeout> | null = null
  let panFrame: number | null = null
  let lastMouseEvent: MouseEvent | null = null

  function showHint() {
    showScaleHint.value = true
    if (hintTimer) clearTimeout(hintTimer)
    hintTimer = setTimeout(() => {
      showScaleHint.value = false
    }, 1200)
  }

  function zoomIn() {
    scale.value = Math.min(scale.value + 0.15, maxScale)
    showHint()
  }

  function zoomOut() {
    scale.value = Math.max(scale.value - 0.15, minScale)
    showHint()
  }

  function resetView() {
    scale.value = 1
    panX.value = 0
    panY.value = 0
    showHint()
  }

  function onWheel(event: WheelEvent) {
    event.preventDefault()
    const delta = event.deltaY > 0 ? -0.1 : 0.1
    scale.value = Math.min(Math.max(scale.value + delta, minScale), maxScale)
    showHint()
  }

  function onMouseDown(event: MouseEvent) {
    if (event.button !== 0 || !svgRef.value) return
    const target = event.target as SVGElement
    if (target.closest('g.knode') || target.tagName === 'text') return
    isDragging.value = true
    dragStart.x = event.clientX
    dragStart.y = event.clientY
    panStart.x = panX.value
    panStart.y = panY.value
    svgRef.value.style.cursor = 'grabbing'
    event.preventDefault()
  }

  function onMouseMove(event: MouseEvent) {
    if (!isDragging.value) return
    lastMouseEvent = event
    if (panFrame !== null) return
    panFrame = requestAnimationFrame(() => {
      panFrame = null
      if (!lastMouseEvent || !svgRef.value) return
      const svgRect = svgRef.value.getBoundingClientRect()
      const dx =
        ((lastMouseEvent.clientX - dragStart.x) / svgRect.width) * (options.width() / scale.value)
      const dy =
        ((lastMouseEvent.clientY - dragStart.y) / svgRect.height) * (options.height() / scale.value)
      panX.value = Math.min(Math.max(panStart.x - dx, -300), 300)
      panY.value = Math.min(Math.max(panStart.y - dy, -300), 300)
    })
  }

  function onMouseUp() {
    if (!isDragging.value) return
    isDragging.value = false
    if (svgRef.value) svgRef.value.style.cursor = 'grab'
  }

  onMounted(() => {
    if (!svgRef.value) return
    svgRef.value.addEventListener('wheel', onWheel, { passive: false })
    svgRef.value.addEventListener('mousedown', onMouseDown)
    svgRef.value.style.cursor = 'grab'
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  })

  onBeforeUnmount(() => {
    if (hintTimer) clearTimeout(hintTimer)
    if (panFrame !== null) cancelAnimationFrame(panFrame)
    svgRef.value?.removeEventListener('wheel', onWheel)
    svgRef.value?.removeEventListener('mousedown', onMouseDown)
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  })

  return { scale, panX, panY, showScaleHint, zoomIn, zoomOut, resetView }
}
