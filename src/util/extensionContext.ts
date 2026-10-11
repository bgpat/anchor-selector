import { browser } from 'wxt/browser';

/** False after the extension is disabled, reloaded, or uninstalled. */
export function isExtensionContextValid() {
  try {
    return Boolean(browser.runtime?.id);
  } catch {
    return false;
  }
}
