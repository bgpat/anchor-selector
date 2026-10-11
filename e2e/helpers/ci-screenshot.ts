import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Page, TestInfo } from '@playwright/test';

const CI_SCREENSHOT_DIR = path.resolve('e2e/ci-screenshots');

export async function saveCiScreenshot(
  page: Page,
  testInfo: TestInfo,
  step: string,
): Promise<void> {
  const safeTitle = testInfo.title.replace(/[^\w.-]+/g, '-').slice(0, 80);
  const fileName = `${testInfo.project.name}-${safeTitle}-${step}.png`;
  const filePath = path.join(CI_SCREENSHOT_DIR, fileName);

  mkdirSync(CI_SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: filePath, fullPage: true });

  await testInfo.attach(step, {
    path: filePath,
    contentType: 'image/png',
  });
}
