import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3107/studio24/';
const useSystemChrome = process.env.PLAYWRIGHT_USE_SYSTEM_CHROME === '1';

export default defineConfig({
  testDir: './e2e',
  testMatch: process.env.CI ? '**/isolated.spec.ts' : '**/*.spec.ts',
  timeout: 45_000,
  expect: {
    timeout: 20_000,
  },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...(useSystemChrome ? { channel: 'chrome' } : {}) },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'node scripts/serve-static.mjs',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
