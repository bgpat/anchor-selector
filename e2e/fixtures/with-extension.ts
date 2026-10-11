import { test as base } from '@playwright/test';
import { withExtension } from 'playwright-webextext';
import path from 'node:path';
import { getE2eBrowserProject } from '../browsers';

export const test = base.extend<{ extDir: string }>({
  extDir: [
    // Playwright fixture deps must use `{}` when none are used.
    // eslint-disable-next-line no-empty-pattern -- required by @playwright/test
    async ({}, use, testInfo) => {
      const { wxtOutputDir } = getE2eBrowserProject(testInfo.project.name);
      await use(path.resolve(`.output/${wxtOutputDir}`));
    },
    { scope: 'test' },
  ],
  context: async ({ playwright, extDir, headless }, use, testInfo) => {
    const browserProject = getE2eBrowserProject(testInfo.project.name);
    const browserType = withExtension(
      playwright[browserProject.playwrightBrowser],
      extDir,
    );

    if (browserProject.requireHeaded && headless) {
      throw new Error(
        `${browserProject.name} extension tests must run headed (use xvfb in CI)`,
      );
    }

    const userDataDir = testInfo.outputPath('user-data');
    const context = await browserType.launchPersistentContext(userDataDir, {
      headless: browserProject.requireHeaded ? false : headless,
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
