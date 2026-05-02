import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const API_PATHS = ['/auth', '/marcas', '/restaurantes', '/items', '/categorias', '/ingredientes']

const proxy = Object.fromEntries(
  API_PATHS.map((path) => [
    path,
    { target: 'http://localhost:3000', changeOrigin: true },
  ]),
)

export default defineConfig({
  plugins: [react()],
  server: { proxy },
})
