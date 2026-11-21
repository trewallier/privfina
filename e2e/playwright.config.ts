import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const previewPort = 4173
const basePath = '/privfina/'
// Playwright loads this config as CJS; __dirname is the e2e/ folder.
const repoRoot = path.resolve(__dirname, '..')

export default defineConfig({
  testDir: './smoke',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${previewPort}${basePath}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  webServer: {
    // Config lives under e2e/; build/preview must run from the repo root.
    cwd: repoRoot,
    command: 'npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: `http://127.0.0.1:${previewPort}${basePath}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000
  },
  projects: [
    {
      name: 'smoke',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
})
