import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  /* 别名与 electron.vite.config.ts / tsconfig paths 一致，保证别名导入与 vi.mock 相对路径解析到同一模块 */
  resolve: {
    alias: {
      '@main': resolve('src/main'),
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer/src'),
      '@': resolve('src/renderer/src')
    }
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    testTimeout: 15000,
    reporters: ['default', 'json'],
    outputFile: { json: 'test-results/unit-results.json' }
  }
})
