import {
  test as base,
  expect,
  type BrowserContext,
  type TestInfo,
} from '@playwright/test';
import { withExtension } from 'playwright-webextext';
import path from 'node:path';
import { activateAnchorSelection } from './helpers/activate-selection';

async function attachContextVideo(
  context: BrowserContext,
  testInfo: TestInfo,
): Promise<void> {
  const page = context.pages()[0];
  const video = page?.video();
  if (!video) {
    return;
  }
  await context.close();
  const videoPath = await video.path();
  if (videoPath) {
    await testInfo.attach('video', {
      path: videoPath,
      contentType: 'video/webm',
    });
  }
}

const FIXTURE_URL = 'http://127.0.0.1:4173/anchor-page.html';
const OVERLAY_SELECTOR = '.--anchor-selector-overlay';

const test = base.extend<{ extDir: string }>({
  extDir: [
    // Playwright fixture deps must use `{}` when none are used.
    // eslint-disable-next-line no-empty-pattern -- required by @playwright/test
    async ({}, use, testInfo) => {
      const extDir =
        testInfo.project.name === 'firefox'
          ? path.resolve('.output/firefox-mv2')
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
    const videoDir = testInfo.outputPath('videos');
    const browserType = withExtension(playwright[browserName], extDir);

    if (browserName === 'chromium') {
      if (headless) {
        throw new Error('Chromium extension tests must run headed (use xvfb in CI)');
      }
      const context = await browserType.launchPersistentContext('', {
        headless: false,
        recordVideo: {
          dir: videoDir,
          size: { width: 1280, height: 720 },
        },
      });
      await use(context);
      await attachContextVideo(context, testInfo);
      return;
    }

    const context = await browserType.launchPersistentContext('', {
      headless,
      recordVideo: {
        dir: videoDir,
        size: { width: 1280, height: 720 },
      },
    });
    await use(context);
    await attachContextVideo(context, testInfo);
  },
  page: async ({ context }, use) => {
    const page = context.pages()[0] ?? (await context.newPage());
    await use(page);
  },
});

test.describe('Anchor Selector extension', () => {
  test('selects an element and updates the page hash', async ({ page }) => {
    await page.goto(FIXTURE_URL);
    await expect(page.locator('#heading')).toBeVisible();

    await activateAnchorSelection(page);
    await expect(page.locator(OVERLAY_SELECTOR)).toBeVisible({ timeout: 10_000 });

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
  });
});
