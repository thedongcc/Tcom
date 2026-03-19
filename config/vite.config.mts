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
  // Tauri v2 期望前端起在 127.0.0.1:1420（避免 localhost 的 IPv6 DNS 解析陷阱）
  server: {
    host: '127.0.0.1',
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
