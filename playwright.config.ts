import { defineConfig, devices } from '@playwright/test';
import { E2E_BROWSER_PROJECTS } from './e2e/browsers';

const port = 4173;

export default defineConfig({
  testDir: 'e2e',
  timeout: process.env.CI ? 180_000 : 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/report' }]],
  outputDir: 'e2e/test-results',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    headless: false,
  },
  webServer: {
    command: 'bun e2e/server.ts',
    url: `http://127.0.0.1:${port}/anchor-page.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: Object.values(E2E_BROWSER_PROJECTS).map((browser) => ({
    name: browser.name,
    use: { ...devices[browser.device] },
  })),
});
