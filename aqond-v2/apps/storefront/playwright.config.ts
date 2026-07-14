import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.E2E_PORT || '3003';
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],
  globalSetup: require.resolve('./e2e/global-setup'),
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'iphone-safari',
      use: { ...devices['iPhone 14'] },
    },
    {
      name: 'android-chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `${baseURL}/api/studio/health`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      ...process.env,
      PV_E2E_PAYSO_MOCK: '1',
    },
  },
});
