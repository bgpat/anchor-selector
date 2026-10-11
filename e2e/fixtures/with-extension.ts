import { test as base } from '@playwright/test';
import { withExtension } from 'playwright-webextext';
import path from 'node:path';

export const test = base.extend<{ extDir: string }>({
  extDir: [
    // Playwright fixture deps must use `{}` when none are used.
    // eslint-disable-next-line no-empty-pattern -- required by @playwright/test
    async ({}, use, testInfo) => {
      const extDir = path.resolve(`.output/${testInfo.project.name}-mv3`);
      await use(extDir);
    },
    { scope: 'test' },
  ],
  context: async (
    { playwright, browserName, extDir, headless },
    use,
    testInfo,
  ) => {
    testInfo.setTimeout(process.env.CI ? 180_000 : 120_000);
    const browserType = withExtension(playwright[browserName], extDir);

    if (testInfo.project.name === 'chrome') {
      if (headless) {
        throw new Error('Chrome extension tests must run headed (use xvfb in CI)');
      }
      const userDataDir = testInfo.outputPath('user-data');
      const context = await browserType.launchPersistentContext(userDataDir, {
        headless: false,
      });
      await use(context);
      await context.close();
      return;
    }

    const userDataDir = testInfo.outputPath('user-data');
    const context = await browserType.launchPersistentContext(userDataDir, {
      headless,
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
