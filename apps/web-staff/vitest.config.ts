import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default mergeConfig(
  viteConfig,
  defineConfig({
    resolve: {
      // El paquete solo declara la condición "browser" en sus exports, que Vitest (Node) no resuelve: se usa su
      // compilación ESM por la ruta (es el mismo encoder que va al navegador).
      alias: {
        'thermal-printer-encoder': path.resolve(__dirname, 'node_modules/thermal-printer-encoder/dist/thermal-printer-encoder.esm.js'),
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      coverage: {
        provider: 'v8',
        reporter: [
          'text',
          'json-summary',
          ['lcov', { projectRoot: path.resolve(__dirname, '../..') }],
        ],
        reportsDirectory: './coverage',
        include: ['src/**/*.{ts,tsx}'],
        exclude: [
          '**/*.d.ts',
          '**/vite-env.d.ts',
          '**/main.tsx',
          '**/vite.config.ts',
          '**/vitest.config.ts',
          'src/test/**',
          '**/*.spec.{ts,tsx}',
          '**/*.test.{ts,tsx}',
        ],
      },
    },
  }),
)
