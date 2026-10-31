import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const repoRoot = path.dirname(fileURLToPath(import.meta.url))
const publicRoot = path.join(repoRoot, 'public')
const financeEngineRoot = path.join(repoRoot, 'src/finance_engine')

export default defineConfig({
  // Project GitHub Pages site: https://trewallier.github.io/privfina/
  base: '/privfina/',
  root: publicRoot,
  // SPA source lives under public/; do not treat it as Vite's static publicDir.
  publicDir: false,
  resolve: {
    alias: {
      '@finance_engine': financeEngineRoot
    }
  },
  server: {
    fs: {
      allow: [publicRoot, financeEngineRoot]
    }
  },
  build: {
    outDir: path.join(repoRoot, 'dist-web'),
    emptyOutDir: true,
    // Do not publish .map beside the SPA on Pages.
    sourcemap: false
  },
  test: {
    root: repoRoot,
    environment: 'node',
    // Product / regression suite only. EBKM diagnosis probes live under
    // tests/exploratory/ and run via `npm run test:exploratory`.
    include: ['tests/**/*.test.ts'],
    exclude: process.env.VITEST_EXPLORATORY
      ? ['**/node_modules/**', '**/dist/**']
      : ['**/node_modules/**', '**/dist/**', 'tests/exploratory/**']
  }
})
