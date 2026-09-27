<template>
  <div class="canvas-wrap">
    <div class="canvas-toolbar">
      <div class="tool-group">
        <div class="tool-switch">
          <button
            class="tool-btn"
            :class="{ active: tool === 'pen' }"
            title="画笔"
            @click="tool = 'pen'"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M3 21L9 19L20 8L16 4L5 15Z" />
            </svg>
          </button>
          <button
            class="tool-btn"
            :class="{ active: tool === 'eraser' }"
            title="橡皮"
            @click="tool = 'eraser'"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M5 19L13 11L20 18L17 21L8 21ZM9 15L13 19" />
            </svg>
          </button>
        </div>

        <div class="color-group">
          <button
            v-for="c in colors"
            :key="c"
            class="color-dot"
            :style="{
              background: c,
              borderColor: activeColor === c && tool === 'pen' ? 'var(--ink)' : 'var(--surface)',
            }"
            @click="
              () => {
                activeColor = c
                tool = 'pen'
              }
            "
          />
        </div>

        <input
          type="range"
          min="1"
          max="8"
          step="0.5"
          v-model.number="brushSize"
          class="size-slider"
        />
      </div>

      <div class="btn-group">
        <div class="zoom-btns">
          <button class="tool-btn" title="缩小" @click="zoomOut" :disabled="scaleVal <= MIN_SCALE">
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <path d="M5 12h14" />
            </svg>
          </button>
          <span class="zoom-label" @click="resetScale" title="点击重置">
            {{ Math.round(scaleVal * 100) }}%
          </span>
          <button class="tool-btn" title="放大" @click="zoomIn" :disabled="scaleVal >= MAX_SCALE">
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>

        <button class="canvas-action-btn" @click="downloadCanvas" title="下载画布">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <path d="M12 5v14M5 19h14M19 14l-7 7-7-7" />
          </svg>
          下载
        </button>
        <button class="canvas-action-btn" @click="clearCanvas">清空</button>
      </div>
    </div>

    <div class="canvas-container" ref="containerRef" @wheel.prevent="onWheel">
      <div
        class="canvas-scaler"
        :style="{
          transform: `scale(${scaleVal})`,
          transformOrigin: 'center center',
        }"
      >
        <canvas
          ref="canvasRef"
          class="sketch-canvas"
          :style="{ cursor: cursorStyle }"
          @mousedown="onDown"
          @mousemove="onMove"
          @mouseup="onUp"
          @mouseleave="onUp"
          @touchstart.prevent="onDown"
          @touchmove.prevent="onMove"
          @touchend="onUp"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// CanvasSketch 组件，封装局部界面和交互逻辑。
import { ref, computed, onMounted } from 'vue'

const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)
const ctxRef = ref<CanvasRenderingContext2D | null>(null)
const tool = ref<'pen' | 'eraser'>('pen')
const activeColor = ref('oklch(0.62 0.10 235)')
const brushSize = ref(2.5)
const isDrawing = ref(false)
const lastPos = ref({ x: 0, y: 0 })
const hasDrawn = ref(false)

const scaleVal = ref(1)
const MIN_SCALE = 0.5
const MAX_SCALE = 3

const colors = [
  'oklch(0.22 0.012 250)',
  'oklch(0.62 0.10 235)',
  'oklch(0.65 0.14 25)',
  'oklch(0.65 0.14 145)',
  'oklch(0.7 0.15 60)',
]

const cursorStyle = computed(() => {
  if (tool.value === 'eraser') return 'cell'
  return 'crosshair'
})

function clampScale(s: number) {
  return Math.min(Math.max(s, MIN_SCALE), MAX_SCALE)
}

function zoomIn() {
  scaleVal.value = clampScale(parseFloat((scaleVal.value + 0.15).toFixed(2)))
}

function zoomOut() {
  scaleVal.value = clampScale(parseFloat((scaleVal.value - 0.15).toFixed(2)))
}

function resetScale() {
  scaleVal.value = 1
}

function onWheel(e: WheelEvent) {
  const delta = e.deltaY > 0 ? -0.08 : 0.08
  scaleVal.value = clampScale(parseFloat((scaleVal.value + delta).toFixed(2)))
}

onMounted(() => {
  const c = canvasRef.value
  const container = containerRef.value
  if (!c || !container) return

  const dpr = window.devicePixelRatio || 1
  const containerRect = container.getBoundingClientRect()

  const W = containerRect.width * 3
  const H = containerRect.height * 3

  c.width = W * dpr
  c.height = H * dpr
  c.style.width = W + 'px'
  c.style.height = H + 'px'

  const ctx = c.getContext('2d')
  if (!ctx) return
  ctx.scale(dpr, dpr)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctxRef.value = ctx
  drawHint()
})

function drawHint() {
  const ctx = ctxRef.value
  const c = canvasRef.value
  if (!ctx || !c || hasDrawn.value) return
  const dpr = window.devicePixelRatio || 1
  const W = c.width / dpr
  const H = c.height / dpr
  ctx.save()
  ctx.fillStyle = 'oklch(0.6 0.014 250)'
  ctx.font = "13px 'JetBrains Mono', monospace"
  ctx.textAlign = 'center'
  ctx.fillText('// 在这里画图、写公式、做思维导图…', W / 2, H / 2)
  ctx.restore()
}

function getPos(e: MouseEvent | TouchEvent) {
  const canvas = canvasRef.value!
  const rect = canvas.getBoundingClientRect()
  const t = 'touches' in e ? e.touches[0] : e

  const x = (t.clientX - rect.left) * (canvas.width / rect.width / (window.devicePixelRatio || 1))
  const y = (t.clientY - rect.top) * (canvas.height / rect.height / (window.devicePixelRatio || 1))
  return { x, y }
}

function onDown(e: MouseEvent | TouchEvent) {
  isDrawing.value = true

  if (!hasDrawn.value) {
    hasDrawn.value = true
    const c = canvasRef.value
    const ctx = ctxRef.value
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height)
  }
  lastPos.value = getPos(e)
}

function onMove(e: MouseEvent | TouchEvent) {
  if (!isDrawing.value || !ctxRef.value) return
  const p = getPos(e)
  const ctx = ctxRef.value
  ctx.globalCompositeOperation = tool.value === 'eraser' ? 'destination-out' : 'source-over'
  ctx.strokeStyle = activeColor.value
  ctx.lineWidth = tool.value === 'eraser' ? brushSize.value * 4 : brushSize.value
  ctx.beginPath()
  ctx.moveTo(lastPos.value.x, lastPos.value.y)
  ctx.lineTo(p.x, p.y)
  ctx.stroke()
  lastPos.value = p
}

function onUp() {
  isDrawing.value = false
}

function clearCanvas() {
  const c = canvasRef.value
  if (!c || !ctxRef.value) return
  ctxRef.value.clearRect(0, 0, c.width, c.height)
  hasDrawn.value = false
  resetScale()
  drawHint()
}

function downloadCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  const url = canvas.toDataURL('image/png')
  const a = document.createElement('a')
  a.href = url
  a.download = '画布草图.png'
  a.click()
}
</script>

<style scoped>
.canvas-wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 8px;
}

.canvas-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  gap: 8px;
}

.tool-group {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.tool-switch {
  display: flex;
  gap: 1px;
  background: var(--bg-3);
  border-radius: 8px;
  padding: 2px;
}

.tool-btn {
  width: 28px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--ink-2);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}
.tool-btn.active {
  background: var(--surface);
  color: var(--ink);
  box-shadow: 0 1px 0 var(--line);
}
.tool-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.tool-btn:not(:disabled):hover {
  background: var(--bg-3);
}

.color-group {
  display: flex;
  gap: 5px;
}

.color-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid var(--surface);
  box-shadow: 0 0 0 1px var(--line);
  padding: 0;
  transition: transform 0.15s;
}
.color-dot:hover {
  transform: scale(1.15);
}

.size-slider {
  width: 70px;
  accent-color: var(--blue-2);
}

.btn-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.zoom-btns {
  display: flex;
  align-items: center;
  gap: 1px;
  background: var(--bg-3);
  border-radius: 8px;
  padding: 2px;
}

.zoom-label {
  font-size: 10.5px;
  font-family: var(--font-mono);
  color: var(--ink-3);
  min-width: 38px;
  text-align: center;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  transition: all 0.15s;
  user-select: none;
}
.zoom-label:hover {
  background: var(--surface);
  color: var(--blue-2);
}

.canvas-action-btn {
  font-size: 11.5px;
  padding: 5px 10px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--ink-2);
  cursor: pointer;
  font-weight: 500;
  font-family: var(--font-sans);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: background 0.15s;
}
.canvas-action-btn:hover {
  background: var(--bg-3);
}

.canvas-container {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--bg-2);
  background-image:
    linear-gradient(var(--line) 1px, transparent 1px),
    linear-gradient(90deg, var(--line) 1px, transparent 1px);
  background-size: 20px 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.canvas-scaler {
  position: absolute;

  width: 300%;
  height: 300%;
  top: -100%;
  left: -100%;
  transform-origin: center center;
  transition: transform 0.12s ease;
}

.sketch-canvas {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
}
</style>
