import { saveCiScreenshot } from './helpers/ci-screenshot';
import { openOptionsPage } from './helpers/open-options-page';
import { expect, test } from './fixtures/with-extension';

test.describe('Options page', () => {
  test('renders settings UI', async ({ context, browserName }, testInfo) => {
    test.skip(
      browserName === 'firefox',
      'Playwright Firefox cannot navigate to moz-extension options pages for screenshots.',
    );
    const page = await openOptionsPage(context);

    await expect(
      page.getByRole('heading', { name: 'Anchor Selector', level: 1 }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Click', level: 2 })).toBeVisible();

    await saveCiScreenshot(page, testInfo, '01-options');
  });
});
