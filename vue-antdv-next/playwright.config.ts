/* 桌面自动化：顺序执行真实 Electron/SQLite/文件/终端场景。 */
import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/electron',
  timeout: 60000,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/electron-results.json' }]],
  use: { trace: 'retain-on-failure' }
})
