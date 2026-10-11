import type { BrowserName } from '@playwright/test';

/** Playwright `--project=` names; WXT build output is `.output/{name}`. */
export const E2E_PROJECT_NAMES = ['chrome', 'firefox'] as const;

export type E2eProjectName = (typeof E2E_PROJECT_NAMES)[number];

/** Playwright `browserName` (project slug `chrome` → `chromium`). */
export function e2ePlaywrightBrowser(name: E2eProjectName): BrowserName {
  return name === 'chrome' ? 'chromium' : name;
}
