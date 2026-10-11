import { test as base, expect } from '@playwright/test';
import { withExtension } from 'playwright-webextext';
import path from 'node:path';
import { activateAnchorSelection } from './helpers/activate-selection';
import { saveCiScreenshot } from './helpers/ci-screenshot';

const FIXTURE_URL = 'http://127.0.0.1:4173/anchor-page.html';
const OVERLAY_SELECTOR = '.--anchor-selector-overlay';

const test = base.extend<{ extDir: string }>({
  extDir: [
    // Playwright fixture deps must use `{}` when none are used.
    // eslint-disable-next-line no-empty-pattern -- required by @playwright/test
    async ({}, use, testInfo) => {
      const extDir =
        testInfo.project.name === 'firefox'
          ? path.resolve('.output/firefox-mv3')
          : path.resolve('.output/chrome-mv3');
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

    if (browserName === 'chromium') {
      if (headless) {
        throw new Error('Chromium extension tests must run headed (use xvfb in CI)');
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

test.describe('Anchor Selector extension', () => {
  test('selects an element and updates the page hash', async ({ page }, testInfo) => {
    await page.goto(FIXTURE_URL);
    await expect(page.locator('#heading')).toBeVisible();
    await saveCiScreenshot(page, testInfo, '01-fixture');

    await activateAnchorSelection(page);
    await expect(page.locator(OVERLAY_SELECTOR)).toBeVisible({ timeout: 10_000 });
    await saveCiScreenshot(page, testInfo, '02-overlay');

    const heading = page.locator('#heading');
    const box = await heading.boundingBox();
    expect(box).not.toBeNull();
    if (box == null) {
      return;
    }

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    await expect(page).toHaveURL(/#heading$/);
    await expect(page.locator(OVERLAY_SELECTOR)).toHaveCount(0, {
      timeout: 10_000,
    });
    await saveCiScreenshot(page, testInfo, '03-selected');
  });
});
