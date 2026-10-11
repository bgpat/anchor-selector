import { E2E_FIXTURE_PATH } from './config';
import { activateAnchorSelection } from './helpers/activate-selection';
import { saveCiScreenshot } from './helpers/ci-screenshot';
import { expect, test } from './fixtures/with-extension';

const OVERLAY_SELECTOR = '.--anchor-selector-overlay';

test.describe('Anchor Selector extension', () => {
  test('selects an element and updates the page hash', async ({ page }, testInfo) => {
    await page.goto(E2E_FIXTURE_PATH);
    await expect(page.locator('#heading')).toBeVisible();
    await saveCiScreenshot(page, testInfo, '01-fixture');

    await activateAnchorSelection(page);
    await expect(page.locator(OVERLAY_SELECTOR)).toBeVisible({ timeout: 10_000 });
    await saveCiScreenshot(page, testInfo, '02-overlay');

    const heading = page.locator('#heading');
    const box = await heading.boundingBox();
    if (box == null) {
      throw new Error('Expected #heading to have a bounding box');
    }

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    await expect(page).toHaveURL(/#heading$/);
    await expect(page.locator(OVERLAY_SELECTOR)).toHaveCount(0, {
      timeout: 10_000,
    });
    await saveCiScreenshot(page, testInfo, '03-selected');
  });

  test('applies hue changes while selecting', async ({ page }) => {
    await page.goto(E2E_FIXTURE_PATH);
    await expect(page.locator('#heading')).toBeVisible();

    await activateAnchorSelection(page);
    const highlight = page.locator(`${OVERLAY_SELECTOR} .selecting path`);
    await expect(highlight).toBeAttached({ timeout: 10_000 });

    const stroke = () =>
      highlight.evaluate((el) => (el as SVGElement).style.stroke);
    const before = await stroke();

    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('anchor-selector-e2e-hue', { detail: 120 }),
      );
    });

    await expect.poll(stroke).not.toBe(before);
  });
});
