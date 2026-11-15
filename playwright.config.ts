import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  expect: { timeout: 20_000 },
  workers: 3,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4321', viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: { command: 'npm run dev -- --port 4321', url: 'http://localhost:4321', reuseExistingServer: true, timeout: 120_000 },
});
