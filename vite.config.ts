import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const repoRoot = path.dirname(fileURLToPath(import.meta.url))
const publicRoot = path.join(repoRoot, 'public')
const financeEngineRoot = path.join(repoRoot, 'src/finance_engine')

export default defineConfig({
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
      allow: [repoRoot]
    }
  },
  build: {
    outDir: path.join(repoRoot, 'dist-web'),
    emptyOutDir: true,
    sourcemap: true
  },
  test: {
    root: repoRoot,
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
})
