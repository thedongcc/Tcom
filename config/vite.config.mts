/**
 * vite.config.mts
 * Vite 构建配置 — 适配 Tauri v2 开发模式。
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  // Tauri v2 期望前端起在 localhost:1420
  server: {
    port: 1420,
    strictPort: true,
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
  optimizeDeps: {
    include: ['react-resizable-panels'],
  },
})
