import browser from 'webextension-polyfill';
import type { Tabs } from 'webextension-polyfill';
import {
  type,
  variables,
  getSelectingBadgeStyle,
  CONTENT_SCRIPT_MARKER,
} from '@/util';
import type { ConfigKey, StoredConfig } from '@/util/config';

const selectingTabs = new Set<number>();
/** Tabs where inject failed after a toolbar click (show badge until URL changes). */
const injectFailedTabs = new Set<number>();

type OverlayClickResult = { overlayActive?: boolean };

type RuntimeMessage =
  | { type: 'ping' }
  | { type: typeof type.click; config: StoredConfig }
  | { type: 'close' }
  | { type: 'get-config'; key: ConfigKey }
  | { type: 'set-config'; key: ConfigKey; value: StoredConfig[ConfigKey] }
  | { type: 'new-tab'; url: string }
  | { type: 'new-window'; url: string };

async function showSelectingBadge(tabId: number) {
  const { background, text, textColor } = await getSelectingBadgeStyle();
  await browser.action.setBadgeBackgroundColor({ tabId, color: background });
  await browser.action.setBadgeTextColor({ tabId, color: textColor });
  await browser.action.setBadgeText({ tabId, text });
}

async function clearSelectingBadge(tabId: number) {
  await browser.action.setBadgeText({ tabId, text: '' });
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

async function getTabUrl(tab: Tabs.Tab) {
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
  await browser.action.setBadgeText({ tabId, text: '' });
  await browser.action.setTitle({ tabId, title: TITLE_UNAVAILABLE });
  await browser.action.disable(tabId);
}

async function markUnavailableAfterClick(tabId: number) {
  injectFailedTabs.add(tabId);
  await browser.action.setBadgeText({ tabId, text: '!' });
  await browser.action.setTitle({ tabId, title: TITLE_UNAVAILABLE });
  await browser.action.disable(tabId);
}

async function markAvailable(tabId: number) {
  injectFailedTabs.delete(tabId);
  await browser.action.setBadgeText({ tabId, text: '' });
  await browser.action.setTitle({ tabId, title: TITLE_READY });
  await browser.action.enable(tabId);
}

async function updateActionForTab(tab: Pick<Tabs.Tab, 'id'>) {
  if (tab.id == null || selectingTabs.has(tab.id)) {
    return;
  }
  const url = await getTabUrl(tab as Tabs.Tab);
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
    await browser.tabs.sendMessage(tabId, { type: 'ping' });
    return true;
  } catch {
    return isContentScriptMarkerPresent(tabId);
  }
}

async function ensureContentScript(tabId: number) {
  await browser.scripting.executeScript({
    target: { tabId },
    files: ['dist/content_script.js'],
  });
  await browser.scripting.insertCSS({
    target: { tabId },
    files: ['stylesheets/overlay.css'],
  });
}

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
    type: type.click,
    config,
  }) as Promise<OverlayClickResult>;
}

browser.action.onClicked.addListener(async (tab) => {
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
    case 'close': {
      const tabId = sender.tab?.id;
      if (tabId == null) {
        return;
      }
      return endSelectionForTab(tabId);
    }
    case 'get-config':
      return browser.storage.sync
        .get(message.key)
        .then(
          (v) =>
            ({ ...variables.config.default, ...v })[message.key] as StoredConfig[ConfigKey],
        );
    case 'set-config':
      browser.storage.sync.set({ [message.key]: message.value });
      break;
    case 'new-tab':
      browser.tabs.create({ url: message.url });
      break;
    case 'new-window':
      browser.windows.create({ url: message.url });
      break;
  }
  },
);

async function initActionState() {
  await browser.action.disable();
  await refreshAllTabs();
}

browser.runtime.onInstalled.addListener(initActionState);

browser.runtime.onStartup.addListener(initActionState);
