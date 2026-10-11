import { test as base } from '@playwright/test';
import { withExtension } from 'playwright-webextext';
import path from 'node:path';
import { e2ePlaywrightBrowser, type E2eProjectName } from '../projects';

export const test = base.extend<{ extDir: string }>({
  extDir: [
    // Playwright fixture deps must use `{}` when none are used.
    // eslint-disable-next-line no-empty-pattern -- required by @playwright/test
    async ({}, use, testInfo) => {
      const project = testInfo.project.name as E2eProjectName;
      await use(path.resolve(`.output/${project}`));
    },
    { scope: 'test' },
  ],
  context: async ({ playwright, extDir }, use, testInfo) => {
    const project = testInfo.project.name as E2eProjectName;
    const browserType = withExtension(
      playwright[e2ePlaywrightBrowser(project)],
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
