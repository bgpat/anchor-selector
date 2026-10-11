import type { BrowserContext, Page } from '@playwright/test';

const FIXTURE_URL = 'http://127.0.0.1:4173/anchor-page.html';

async function prepareFixturePage(context: BrowserContext): Promise<Page> {
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(FIXTURE_URL, { waitUntil: 'domcontentloaded' });
  await page.locator('#heading').waitFor({ state: 'visible', timeout: 15_000 });
  return page;
}

async function resolveOptionsUrlFromFixture(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          window.removeEventListener('message', onMessage);
          reject(new Error('Timed out waiting for options URL from extension'));
        }, 15_000);

        const onMessage = (event: MessageEvent) => {
          const data = event.data as { type?: string; url?: string };
          if (data?.type !== 'anchor-selector-e2e-options-url' || !data.url) {
            return;
          }
          window.clearTimeout(timeout);
          window.removeEventListener('message', onMessage);
          resolve(data.url);
        };

        window.addEventListener('message', onMessage);
        window.dispatchEvent(new CustomEvent('anchor-selector-e2e-options-url'));
      }),
  );
}

/** Opens the extension options UI (Chromium persistent context only). */
export async function openOptionsPage(context: BrowserContext): Promise<Page> {
  const fixturePage = await prepareFixturePage(context);
  const optionsUrl = await resolveOptionsUrlFromFixture(fixturePage);
  const optionsPage = await context.newPage();
  await optionsPage.goto(optionsUrl, { waitUntil: 'domcontentloaded' });
  return optionsPage;
}
