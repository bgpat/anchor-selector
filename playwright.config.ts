import { defineConfig } from '@playwright/test';
import { E2E_FIXTURE_PATH, E2E_PORT } from './e2e/constants';
import {
  E2E_PROJECT_NAMES,
  e2ePlaywrightBrowser,
} from './e2e/projects';

/** Playwright cannot observe moz-extension options tabs opened from the background. */
const FIREFOX_E2E_TEST_IGNORE = [/options.*\.spec\.ts$/];

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
    baseURL: `http://127.0.0.1:${E2E_PORT}`,
    trace: 'retain-on-failure',
    headless: false,
  },
  webServer: {
    command: 'bun e2e/server.ts',
    url: `http://127.0.0.1:${E2E_PORT}${E2E_FIXTURE_PATH}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: E2E_PROJECT_NAMES.map((name) => ({
    name,
    use: { browserName: e2ePlaywrightBrowser(name) },
    ...(name === 'firefox' ? { testIgnore: FIREFOX_E2E_TEST_IGNORE } : {}),
  })),
});
