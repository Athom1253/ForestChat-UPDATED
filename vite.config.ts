import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  strictPort: true,
  allowedHosts: true,
  proxy: {
      '/functions': {
        target: 'https://api.supabase.com',
        changeOrigin: true,
        rewrite: (path) => path,
      },
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
