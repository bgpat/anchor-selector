import { test as base, type BrowserName } from '@playwright/test';
import { withExtension } from 'playwright-webextext';
import path from 'node:path';
import type { E2eProjectName } from '../config';

function projectBrowserName(use: { browserName?: BrowserName }): BrowserName {
  const name = use.browserName;
  if (name == null) {
    throw new Error('Playwright project is missing use.browserName');
  }
  return name;
}

export const test = base.extend<{ e2eProject: E2eProjectName; extDir: string }>({
  e2eProject: [
    // Playwright fixture deps must use `{}` when none are used.
    // eslint-disable-next-line no-empty-pattern -- required by @playwright/test
    async ({}, use, testInfo) => {
      await use(testInfo.project.name as E2eProjectName);
    },
    { scope: 'test' },
  ],
  extDir: async ({ e2eProject }, use) => {
    await use(path.resolve(`.output/${e2eProject}`));
  },
  context: async ({ playwright, extDir }, use, testInfo) => {
    const browserType = withExtension(
      playwright[projectBrowserName(testInfo.project.use)],
      extDir,
    );

    const userDataDir = testInfo.outputPath('user-data');
    const context = await browserType.launchPersistentContext(userDataDir, {
      headless: false,
    });
    await use(context);
    await context.close();
  },
  page: async ({ context }, use) => {
    const page = context.pages()[0] ?? (await context.newPage());
    await use(page);
  },
});

export { expect } from '@playwright/test';
