import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const __dirname = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// https://vitejs.dev/config/
export default defineConfig({
  base: './', // Fix white screen (absolute paths issue)
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            lib: {
              entry: {
                main: 'electron/main.ts',
                'timer-worker': 'electron/timer-worker.ts',
              },
              formats: ['cjs'],
              fileName: (format, entryName) => `${entryName}.js`,
            },
            rollupOptions: {
              external: ['serialport', 'electron', 'koffi', /^node:/],
              output: {
                format: 'cjs',
              },
            },
          },
        },
      },
      preload: {
        input: path.join(__dirname, 'electron/preload.ts'),
      },
      renderer: process.env.NODE_ENV === 'test'
        ? undefined
        : {},
    }),
  ],
  optimizeDeps: {
    include: ['react-resizable-panels'],
  },
})
