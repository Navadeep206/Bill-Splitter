import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: {
    // `@/` points at src/, the same alias as tsconfig.json "paths".
    alias: { '@': decodeURIComponent(new URL('./src', import.meta.url).pathname) },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
