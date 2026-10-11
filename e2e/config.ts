import type { BrowserName, PlaywrightTestProject } from '@playwright/test';

/** Shared with `e2e/server.ts` and `playwright.config.ts`. */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 4173);

export const E2E_FIXTURE_PATH = '/anchor-page.html';

/** Playwright `--project=` / WXT `-b` / `.output/{name}`. */
export const E2E_PROJECT_NAMES = ['chrome', 'firefox'] as const;

export type E2eProjectName = (typeof E2E_PROJECT_NAMES)[number];

function playwrightBrowserName(name: E2eProjectName): BrowserName {
  return name === 'chrome' ? 'chromium' : name;
}

/** Playwright projects for `playwright.config.ts`. */
export function e2ePlaywrightProjects(): PlaywrightTestProject[] {
  return E2E_PROJECT_NAMES.map((name) => ({
    name,
    use: { browserName: playwrightBrowserName(name) },
    // Firefox: Playwright cannot attach to moz-extension options tabs (see open-options-page).
    testIgnore: name === 'firefox' ? ['**/options/**'] : undefined,
  }));
}
