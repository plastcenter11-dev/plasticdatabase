import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// VITE_PORT / API_TARGET let the browser smoke tests (npm run e2e) run a second
// copy of the app against an isolated backend; normal development is unchanged.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.VITE_PORT) || 5173,
    proxy: { '/api': process.env.API_TARGET || 'http://localhost:3001' },
  },
})
