import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  build: {
    // 把第三方大依赖切成独立 chunk：
    // - 业务代码迭代频繁，vendor 不变；浏览器可以长缓存这些 chunk
    // - 首屏只加载 vue 内核，marked / hljs / confetti 按需在打开对应页面时拉取
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-vue': ['vue', 'vue-router', 'pinia'],
          'vendor-md': ['marked', 'highlight.js'],
          'vendor-flow': ['@vue-flow/core', '@vue-flow/background', 'dagre'],
          'vendor-editor': ['md-editor-v3'],
          'vendor-confetti': ['canvas-confetti'],
          'vendor-axios': ['axios'],
        },
      },
    },
    // 提高警告阈值，避免 vendor chunk 触发"chunk 过大"警告噪声
    chunkSizeWarningLimit: 800,
  },
})
