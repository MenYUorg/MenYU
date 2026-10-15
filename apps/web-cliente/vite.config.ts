import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Backend al que se reenvían /api y /socket.io cuando la app se abre por un túnel (con VITE_API_URL=/api).
const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:3000'

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: Number(process.env.PORT) || 5176,
    // La cámara solo anda en HTTPS (o en localhost): para probar desde un iPhone se abre un túnel de Cloudflare hacia este
    // servidor. Vite solo contesta a los nombres de host que conoce, así que se permiten los del túnel.
    allowedHosts: ['.trycloudflare.com'],
    // Con VITE_API_URL=/api la app le habla a este mismo servidor, que reenvía al backend: así alcanza un solo túnel.
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true },
      '/socket.io': { target: BACKEND, changeOrigin: true, ws: true },
    },
  },
})
