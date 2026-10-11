import { openOptionsPage } from './helpers/open-options-page';
import { expect, test } from './fixtures/with-extension';
import variables from '../src/util/variables';

const DEFAULT_HUE = variables.config.default.hue;

test.describe('Options reset', () => {
  test('Reset to defaults restores storage', async ({ context }, testInfo) => {
    test.skip(testInfo.project.name === 'firefox', 'Options page E2E is Chrome-only.');

    const page = await openOptionsPage(context);
    const hueSlider = page.locator('.options-hue input[type="range"]');
    await expect(hueSlider).toHaveValue(String(DEFAULT_HUE));

    await hueSlider.fill('42');
    await expect(hueSlider).toHaveValue('42');

    await page.getByLabel('alt ⌥').check();
    await page.selectOption('#click-action', 'copy-url');
    await expect(page.locator('.options-bindings li')).toHaveCount(5);

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Reset to defaults' }).click();
    await expect(hueSlider).toHaveValue(String(DEFAULT_HUE));
    await expect(page.locator('.options-bindings li')).toHaveCount(4);

    const storedHue = await page.evaluate(async () => {
      const v = await chrome.storage.sync.get('hue');
      return v.hue as number | undefined;
    });
    expect(storedHue).toBe(DEFAULT_HUE);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(hueSlider).toHaveValue(String(DEFAULT_HUE), { timeout: 15_000 });
  });
});
