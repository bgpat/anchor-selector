import type { BrowserName } from '@playwright/test';

/** Playwright `devices[...]` key used in playwright.config.ts */
export type E2eDeviceName = 'Desktop Chrome' | 'Desktop Firefox';

export type E2eBrowserProject = {
  /** Playwright project name (`--project=` / testInfo.project.name) */
  name: string;
  /** `playwright.chromium` / `firefox` / `webkit` */
  playwrightBrowser: BrowserName;
  /** WXT build output directory name under `.output/` */
  wxtOutputDir: string;
  device: E2eDeviceName;
  /** Options page can be opened reliably in Playwright automation. */
  supportsOptionsPage: boolean;
};

export const E2E_BROWSER_PROJECTS = {
  chrome: {
    name: 'chrome',
    playwrightBrowser: 'chromium',
    wxtOutputDir: 'chrome-mv3',
    device: 'Desktop Chrome',
    requireHeaded: true,
    supportsOptionsPage: true,
  },
  firefox: {
    name: 'firefox',
    playwrightBrowser: 'firefox',
    wxtOutputDir: 'firefox-mv3',
    device: 'Desktop Firefox',
    requireHeaded: false,
    supportsOptionsPage: false,
  },
} as const satisfies Record<string, E2eBrowserProject>;

export type E2eBrowserProjectName = keyof typeof E2E_BROWSER_PROJECTS;

export function getE2eBrowserProject(projectName: string): E2eBrowserProject {
  const project =
    E2E_BROWSER_PROJECTS[projectName as E2eBrowserProjectName];
  if (project == null) {
    throw new Error(
      `Unknown Playwright project "${projectName}". Expected one of: ${Object.keys(E2E_BROWSER_PROJECTS).join(', ')}`,
    );
  }
  return project;
}
