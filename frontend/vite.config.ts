// Vite 构建配置，控制插件、别名和打包策略。

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const vendorChunks: Record<string, string[]> = {
  'vendor-vue': ['vue', 'vue-router', 'pinia'],
  'vendor-md': ['marked', 'highlight.js', 'dompurify'],
  'vendor-flow': ['@vue-flow/core', '@vue-flow/background', 'dagre'],
  'vendor-editor': ['md-editor-v3'],
  'vendor-confetti': ['canvas-confetti'],
  'vendor-axios': ['axios'],
}

export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          for (const [chunkName, packages] of Object.entries(vendorChunks)) {
            if (packages.some((pkg) => id.includes(`node_modules/${pkg}`))) return chunkName
          }
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
})
