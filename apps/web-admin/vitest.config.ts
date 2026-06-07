import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json-summary'],
        reportsDirectory: './coverage',
        exclude: ['**/*.d.ts', '**/vite-env.d.ts', '**/main.tsx', '**/vite.config.ts', '**/vitest.config.ts'],
      },
    },
  }),
)
