import { activateAnchorSelection } from './helpers/activate-selection';
import { saveCiScreenshot } from './helpers/ci-screenshot';
import { expect, test } from './fixtures/with-extension';

const FIXTURE_URL = 'http://127.0.0.1:4173/anchor-page.html';
const OVERLAY_SELECTOR = '.--anchor-selector-overlay';

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
