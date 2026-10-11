import type { Page } from '@playwright/test';

export async function activateAnchorSelection(page: Page) {
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('anchor-selector-e2e'));
  });
}
