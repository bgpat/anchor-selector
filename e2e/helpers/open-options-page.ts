import type { BrowserContext, Page } from '@playwright/test';
import { E2E_FIXTURE_PATH } from '../config';

async function prepareFixturePage(context: BrowserContext): Promise<Page> {
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(E2E_FIXTURE_PATH, { waitUntil: 'domcontentloaded' });
  await page.locator('#heading').waitFor({ state: 'visible', timeout: 15_000 });
  return page;
}

/** Opens the extension options UI in a new tab of the extension context. */
export async function openOptionsPage(context: BrowserContext): Promise<Page> {
  const fixturePage = await prepareFixturePage(context);
  const pagePromise = context.waitForEvent('page', { timeout: 30_000 });
  await fixturePage.evaluate(() => {
    window.dispatchEvent(new CustomEvent('anchor-selector-e2e-options-open'));
  });
  const optionsPage = await pagePromise;
  await optionsPage.waitForURL(/options\.html/, { timeout: 30_000 });
  await optionsPage.waitForLoadState('domcontentloaded');
  return optionsPage;
}
