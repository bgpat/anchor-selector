import { browser } from 'wxt/browser';
import {
  runtimeMessageType,
  variables,
  getSelectingBadgeStyle,
  CONTENT_SCRIPT_MARKER,
} from '@/util';
import {
  cloneStoredConfig,
  configKey,
  type ConfigKey,
  type StoredConfig,
} from '@/util/config';

type BrowserActionApi = typeof browser.action;

/** Firefox MV2 exposes this as `browser.browserAction`; MV3 and Chrome use `browser.action`. */
function browserActionApi(): BrowserActionApi {
  const firefoxAction = (
    browser as typeof browser & { browserAction?: BrowserActionApi }
  ).browserAction;
  if (browser.action) {
    return browser.action;
  }
  if (firefoxAction) {
    return firefoxAction;
  }
  return browser.action;
}

const selectingTabs = new Set<number>();
/** Tabs where inject failed after a toolbar click (show badge until URL changes). */
const injectFailedTabs = new Set<number>();

type OverlayClickResult = { overlayActive?: boolean };

type RuntimeMessage =
  | { type: typeof runtimeMessageType.ping }
  | { type: typeof runtimeMessageType.click; config: StoredConfig }
  | { type: typeof runtimeMessageType.close }
  | { type: typeof runtimeMessageType.getConfig; key: ConfigKey }
  | {
      type: typeof runtimeMessageType.setConfig;
      key: ConfigKey;
      value: StoredConfig[ConfigKey];
    }
  | { type: typeof runtimeMessageType.resetConfig }
  | { type: typeof runtimeMessageType.newTab; url: string }
  | { type: typeof runtimeMessageType.newWindow; url: string }
  | { type: typeof runtimeMessageType.openOptionsE2e };

async function showSelectingBadge(tabId: number) {
  const { background, text, textColor } = await getSelectingBadgeStyle();
  await browserActionApi().setBadgeBackgroundColor({ tabId, color: background });
  await browserActionApi().setBadgeTextColor({ tabId, color: textColor });
  await browserActionApi().setBadgeText({ tabId, text });
}

async function clearSelectingBadge(tabId: number) {
  await browserActionApi().setBadgeText({ tabId, text: '' });
}

async function endSelectionForTab(tabId: number) {
  selectingTabs.delete(tabId);
  await clearSelectingBadge(tabId);
  await updateActionForTab({ id: tabId });
}

async function startSelectionForTab(tabId: number) {
  selectingTabs.add(tabId);
  try {
    await showSelectingBadge(tabId);
  } catch {
    selectingTabs.delete(tabId);
    await updateActionForTab({ id: tabId });
  }
}

async function applyOverlayClickResult(
  tabId: number,
  result: OverlayClickResult | undefined,
) {
  if (result?.overlayActive === false) {
    return;
  }
  if (result?.overlayActive === true || result == null) {
    await startSelectionForTab(tabId);
  }
}

const TITLE_READY = 'jump to the anchored element';
const TITLE_UNAVAILABLE =
  'Anchor Selector — not available on this page';

function isWebPage(url: string) {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

async function getTabUrl(tab: { id?: number; url?: string }) {
  if (tab.url) {
    return tab.url;
  }
  if (tab.id == null) {
    return null;
  }
  try {
    return (await browser.tabs.get(tab.id)).url;
  } catch {
    return null;
  }
}

async function markUnavailable(tabId: number) {
  injectFailedTabs.delete(tabId);
  await browserActionApi().setBadgeText({ tabId, text: '' });
  await browserActionApi().setTitle({ tabId, title: TITLE_UNAVAILABLE });
  await browserActionApi().disable(tabId);
}

async function markUnavailableAfterClick(tabId: number) {
  injectFailedTabs.add(tabId);
  await browserActionApi().setBadgeText({ tabId, text: '!' });
  await browserActionApi().setTitle({ tabId, title: TITLE_UNAVAILABLE });
  await browserActionApi().disable(tabId);
}

async function markAvailable(tabId: number) {
  injectFailedTabs.delete(tabId);
  await browserActionApi().setBadgeText({ tabId, text: '' });
  await browserActionApi().setTitle({ tabId, title: TITLE_READY });
  await browserActionApi().enable(tabId);
}

async function updateActionForTab(tab: { id?: number; url?: string }) {
  if (tab.id == null || selectingTabs.has(tab.id)) {
    return;
  }
  const url = await getTabUrl(tab);
  if (!url || !isWebPage(url)) {
    await markUnavailable(tab.id);
    return;
  }
  if (injectFailedTabs.has(tab.id)) {
    await markUnavailableAfterClick(tab.id);
    return;
  }
  await markAvailable(tab.id);
}

function refreshAllTabs() {
  return browser.tabs
    .query({})
    .then((tabs) => Promise.all(tabs.map((tab) => updateActionForTab(tab))));
}

async function isContentScriptMarkerPresent(tabId: number) {
  try {
    const [probe] = await browser.scripting.executeScript({
      target: { tabId },
      func: (marker: string) => Boolean(globalThis[marker as keyof typeof globalThis]),
      args: [CONTENT_SCRIPT_MARKER],
    });
    return probe?.result === true;
  } catch {
    return false;
  }
}

async function isContentScriptReady(tabId: number) {
  try {
    await browser.tabs.sendMessage(tabId, {
      type: runtimeMessageType.ping,
    });
    return true;
  } catch {
    return isContentScriptMarkerPresent(tabId);
  }
}

async function ensureContentScript(tabId: number) {
  await browser.scripting.executeScript({
    target: { tabId },
    files: ['/content_script.js'],
  });
  await browser.scripting.insertCSS({
    target: { tabId },
    files: ['/assets/overlay.css'],
  });
}

export function registerBackground() {
browser.tabs.onActivated.addListener(({ tabId }) => {
  browser.tabs.get(tabId).then(updateActionForTab);
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'loading') {
    injectFailedTabs.delete(tabId);
  }
  if (changeInfo.status === 'complete' || changeInfo.url) {
    updateActionForTab({ ...tab, id: tabId });
  }
});

async function sendClickToTab(tabId: number, config: StoredConfig) {
  return browser.tabs.sendMessage(tabId, {
    type: runtimeMessageType.click,
    config,
  }) as Promise<OverlayClickResult>;
}

browserActionApi().onClicked.addListener(async (tab) => {
  if (!tab.url || !isWebPage(tab.url) || tab.id == null) {
    return;
  }
  const config = await variables.config.getAll();
  try {
    if (!(await isContentScriptReady(tab.id))) {
      await ensureContentScript(tab.id);
    }
  } catch {
    if (!(await isContentScriptMarkerPresent(tab.id))) {
      await markUnavailableAfterClick(tab.id);
      return;
    }
  }
  await markAvailable(tab.id);
  try {
    const result = await sendClickToTab(tab.id, config);
    await applyOverlayClickResult(tab.id, result);
  } catch {
    await endSelectionForTab(tab.id);
    await markUnavailableAfterClick(tab.id);
  }
});

browser.runtime.onMessage.addListener(
  (raw: unknown, sender: { tab?: { id?: number } }) => {
  const message = raw as RuntimeMessage;
  switch (message.type) {
    case runtimeMessageType.ping:
      break;
    case runtimeMessageType.close: {
      const tabId = sender.tab?.id;
      if (tabId == null) {
        return;
      }
      return endSelectionForTab(tabId);
    }
    case runtimeMessageType.getConfig:
      return browser.storage.sync.get(message.key).then((stored) => {
        const merged = {
          ...cloneStoredConfig(variables.config.default),
          ...stored,
        };
        if (message.key === configKey.click) {
          return cloneStoredConfig(merged)[configKey.click];
        }
        return merged[message.key] as StoredConfig[ConfigKey];
      });
    case runtimeMessageType.setConfig:
      return browser.storage.sync.set({ [message.key]: message.value });
    case runtimeMessageType.resetConfig:
      return browser.storage.sync.set(
        cloneStoredConfig(variables.config.default),
      );
    case runtimeMessageType.newTab:
      browser.tabs.create({ url: message.url });
      break;
    case runtimeMessageType.newWindow:
      browser.windows.create({ url: message.url });
      break;
    case runtimeMessageType.openOptionsE2e:
      return browser.tabs.create({
        url: browser.runtime.getURL('/options.html'),
      });
  }
  },
);

async function initActionState() {
  await browserActionApi().disable();
  await refreshAllTabs();
}

browser.runtime.onInstalled.addListener(initActionState);

browser.runtime.onStartup.addListener(initActionState);

browser.storage.sync.onChanged.addListener((changes) => {
  if (typeof changes[configKey.hue]?.newValue !== 'number') {
    return;
  }
  for (const tabId of selectingTabs) {
    void showSelectingBadge(tabId).catch(() => {});
  }
});
}
