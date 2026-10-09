import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { include: ['tests/unit/**/*.test.ts'], environment: 'node', testTimeout: 15000, reporters: ['default', 'json'], outputFile: { json: 'test-results/unit-results.json' } } })
