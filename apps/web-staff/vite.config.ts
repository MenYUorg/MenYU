import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Backend al que se reenvían /api y /socket.io. VITE_API_URL vale /api por defecto, así que en local la app le habla a
// este mismo servidor. Con BACKEND_URL=https://api.staging.menyu-app.com se prueba contra staging sin tocar su CORS.
const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:3000'

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router-dom'],
  },
  server: {
    port: Number(process.env.PORT) || 5175,
    // Vite solo contesta a los nombres de host que conoce: staff.menyu.local (docs/auth/specs/auth.md, Dominios).
    allowedHosts: ['.menyu.local'],
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true },
      // Con VITE_API_URL=/api, `urlDelSocket` deja la URL del socket vacía y Socket.io apunta a este servidor: sin
      // este reenvío, en local no llegan los eventos de Cocina, Mesas, Pedidos ni los llamados al mozo.
      '/socket.io': { target: BACKEND, changeOrigin: true, ws: true },
    },
  },
})
