import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router-dom'],
  },
  server: {
    port: Number(process.env.PORT) || 5175,
    // Vite solo contesta a los nombres de host que conoce: staff.menyu.local (docs/specs/auth.md, Dominios).
    allowedHosts: ['.menyu.local'],
  },
})
