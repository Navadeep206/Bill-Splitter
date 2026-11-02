import { defineConfig, devices } from '@playwright/test'

// Browser tests. They need the API and the web dev server, which Playwright starts
// (or reuses if they are already running). Run with `pnpm test:e2e` from the root.
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  // The tests share one local database, so run them one at a time.
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter bill-splitter-api dev',
      url: 'http://localhost:8787/api/health',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter bill-splitter-web dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
})
