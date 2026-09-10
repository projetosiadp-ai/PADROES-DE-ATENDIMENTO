import { defineConfig, devices } from '@playwright/test';

const LOCAL_APP_URL = 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL: LOCAL_APP_URL,
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run serve',
    url: LOCAL_APP_URL,
    env: { NO_UPDATE_CHECK: '1' },
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'desktop-light',
      use: { ...devices['Desktop Chrome'], colorScheme: 'light' },
    },
    {
      name: 'desktop-dark',
      use: { ...devices['Desktop Chrome'], colorScheme: 'dark' },
    },
    {
      name: 'mobile-360-light',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 360, height: 800 },
        hasTouch: true,
        isMobile: true,
        colorScheme: 'light',
      },
    },
    {
      name: 'mobile-360-dark',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 360, height: 800 },
        hasTouch: true,
        isMobile: true,
        colorScheme: 'dark',
      },
    },
  ],
});
