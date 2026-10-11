import type { Page } from '@playwright/test';

/** Read one key from `storage.sync` inside an extension page (Chrome or Firefox). */
export async function readSyncStorageValue(
  page: Page,
  key: string,
): Promise<unknown> {
  return page.evaluate(async (storageKey) => {
    const runtime = globalThis.browser ?? globalThis.chrome;
    const values = await runtime.storage.sync.get(storageKey);
    return values[storageKey as keyof typeof values];
  }, key);
}
