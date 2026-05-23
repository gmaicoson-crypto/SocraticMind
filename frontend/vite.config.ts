import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      output: {
        // 将第三方依赖按用途拆分为独立 chunk，利用浏览器长缓存
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
    chunkSizeWarningLimit: 800,
  },
})
