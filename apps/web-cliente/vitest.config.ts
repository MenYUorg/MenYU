import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
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
          '**/*.spec.{ts,tsx}',
          '**/*.test.{ts,tsx}',
        ],
      },
    },
  }),
)
