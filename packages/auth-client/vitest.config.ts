import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Cobertura propia de @menyu/auth-client: las apps solo reportan su src/, así que lo compartido se mide acá.
export default defineConfig({
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
        '**/vitest.config.ts',
        'src/test/**',
        '**/*.spec.{ts,tsx}',
        '**/*.test.{ts,tsx}',
      ],
    },
  },
})
