import { devices, type BrowserName } from '@playwright/test';

/** Playwright browser type per E2E project name (`--project=`). */
export const E2E_PROJECTS = {
  chrome: 'chromium',
  firefox: 'firefox',
} as const satisfies Record<string, BrowserName>;

export type E2eProjectName = keyof typeof E2E_PROJECTS;

export function assertE2eProjectName(
  projectName: string,
): asserts projectName is E2eProjectName {
  if (!(projectName in E2E_PROJECTS)) {
    throw new Error(
      `Unknown Playwright project "${projectName}". Expected one of: ${Object.keys(E2E_PROJECTS).join(', ')}`,
    );
  }
}

export function e2eExtensionOutputDir(projectName: E2eProjectName): string {
  return `${projectName}-mv3`;
}

/** `devices[\`Desktop ${Project}\`]` — e.g. chrome → Desktop Chrome. */
export function e2ePlaywrightDeviceUse(projectName: E2eProjectName) {
  const deviceName = `Desktop ${projectName.charAt(0).toUpperCase()}${projectName.slice(1)}`;
  if (!(deviceName in devices)) {
    throw new Error(
      `Playwright has no devices["${deviceName}"] for E2E project "${projectName}".`,
    );
  }
  return { ...devices[deviceName as keyof typeof devices] };
}
