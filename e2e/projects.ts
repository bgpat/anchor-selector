import type { BrowserName } from '@playwright/test';

/** Playwright `--project=` names; WXT build output is `.output/{name}-mv3`. */
export const E2E_PROJECT_NAMES = ['chrome', 'firefox'] as const;

export type E2eProjectName = (typeof E2E_PROJECT_NAMES)[number];

export function isE2eProjectName(name: string): name is E2eProjectName {
  return (E2E_PROJECT_NAMES as readonly string[]).includes(name);
}

export function assertE2eProjectName(
  name: string,
): asserts name is E2eProjectName {
  if (!isE2eProjectName(name)) {
    throw new Error(
      `Unknown Playwright project "${name}". Expected: ${E2E_PROJECT_NAMES.join(', ')}`,
    );
  }
}

/** Playwright `browserName` (project slug `chrome` → `chromium`). */
export function e2ePlaywrightBrowser(name: E2eProjectName): BrowserName {
  return name === 'chrome' ? 'chromium' : name;
}

export function e2eExtensionOutputDir(name: E2eProjectName): string {
  return `${name}-mv3`;
}
