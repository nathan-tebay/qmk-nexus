import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3001,
    allowedHosts: ['qmknexus.local', 'qmknexus-backend.local'],
    proxy: {
      '/api': {
        target: process.env.BACKEND_URL ?? 'http://backend:8000',
        changeOrigin: true,
        cookieDomainRewrite: '',
      },
    },
  },
})
