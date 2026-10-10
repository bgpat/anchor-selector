import browser from 'webextension-polyfill';
import {
  type,
  variables,
  makeActiveIcon,
  makeDefaultIcon,
  getSelectionAccentColor,
  CONTENT_SCRIPT_MARKER,
} from '@/util';

const SELECTING_BADGE = '●';

function getDefaultIconPaths() {
  const png = browser.runtime.getURL('icons/anchor-selector.png');
  return { 16: png, 32: png, 48: png };
}

const selectingTabs = new Set();
/** Tabs where inject failed after a toolbar click (show badge until URL changes). */
const injectFailedTabs = new Set();
/** Bumped on close so in-flight makeActiveIcon cannot repaint after overlay ends. */
const actionIconEpoch = new Map();
let defaultActionIconImageData = null;

async function getDefaultActionIconImageData() {
  if (!defaultActionIconImageData) {
    defaultActionIconImageData = await makeDefaultIcon();
  }
  return defaultActionIconImageData;
}

function cloneImageData(src) {
  return new ImageData(
    new Uint8ClampedArray(src.data),
    src.width,
    src.height,
  );
}

/**
 * Clear per-tab icon override so the toolbar uses the global/manifest icon.
 * Chrome only drops tab imageData on navigation unless cleared with {} (see MDN).
 */
async function resetActionIcon(tabId) {
  await browser.action
    .setIcon({ tabId, imageData: {} })
    .catch(() => {});
  try {
    await browser.action.setIcon({ tabId, path: getDefaultIconPaths() });
  } catch {
    const imageData = cloneImageData(await getDefaultActionIconImageData());
    await browser.action.setIcon({ tabId, imageData });
  }
}

async function setGlobalDefaultActionIcon() {
  await browser.action.setIcon({ path: getDefaultIconPaths() });
}

let usesColoredTabIconPromise = null;

/** Firefox resets tab icons reliably; Chromium MV3 tab imageData often sticks until navigation. */
async function usesColoredTabIcon() {
  if (!usesColoredTabIconPromise) {
    usesColoredTabIconPromise = (async () => {
      try {
        const { name } = await browser.runtime.getBrowserInfo();
        return name === 'Firefox';
      } catch {
        return false;
      }
    })();
  }
  return usesColoredTabIconPromise;
}

async function showSelectingBadge(tabId) {
  const color = await getSelectionAccentColor();
  await browser.action.setBadgeBackgroundColor({ tabId, color });
  await browser.action.setBadgeText({ tabId, text: SELECTING_BADGE });
}

async function clearSelectingBadge(tabId) {
  await browser.action.setBadgeText({ tabId, text: '' });
}

async function endSelectionForTab(tabId) {
  selectingTabs.delete(tabId);
  actionIconEpoch.set(tabId, (actionIconEpoch.get(tabId) ?? 0) + 1);
  await clearSelectingBadge(tabId);
  await resetActionIcon(tabId);
  await updateActionForTab({ id: tabId });
}

async function startSelectionForTab(tabId) {
  selectingTabs.add(tabId);
  try {
    if (await usesColoredTabIcon()) {
      const epochAtOpen = actionIconEpoch.get(tabId) ?? 0;
      const img = await makeActiveIcon();
      if ((actionIconEpoch.get(tabId) ?? 0) !== epochAtOpen) {
        return;
      }
      if (!selectingTabs.has(tabId)) {
        return;
      }
      await browser.action.setIcon({
        tabId,
        imageData: cloneImageData(img),
      });
      return;
    }
    await showSelectingBadge(tabId);
  } catch {
    selectingTabs.delete(tabId);
    await updateActionForTab({ id: tabId });
  }
}

async function applyOverlayClickResult(tabId, result) {
  if (result?.overlayActive) {
    await startSelectionForTab(tabId);
  }
  // overlay closed: content script awaits the close message (icon reset there)
}
const TITLE_READY = 'jump to the anchored element';
const TITLE_UNAVAILABLE =
  'Anchor Selector — not available on this page';

function isWebPage(url) {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

async function getTabUrl(tab) {
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

async function markUnavailable(tabId) {
  injectFailedTabs.delete(tabId);
  await browser.action.setBadgeText({ tabId, text: '' });
  await browser.action.setTitle({ tabId, title: TITLE_UNAVAILABLE });
  await browser.action.disable(tabId);
}

async function markUnavailableAfterClick(tabId) {
  injectFailedTabs.add(tabId);
  await browser.action.setBadgeText({ tabId, text: '!' });
  await browser.action.setTitle({ tabId, title: TITLE_UNAVAILABLE });
  await browser.action.disable(tabId);
}

async function markAvailable(tabId) {
  injectFailedTabs.delete(tabId);
  await browser.action.setBadgeText({ tabId, text: '' });
  await browser.action.setTitle({ tabId, title: TITLE_READY });
  await browser.action.enable(tabId);
}

async function updateActionForTab(tab) {
  if (tab.id == null || selectingTabs.has(tab.id)) {
    return;
  }
  const url = await getTabUrl(tab);
  if (!url || !isWebPage(url)) {
    await markUnavailable(tab.id);
    if (await usesColoredTabIcon()) {
      await resetActionIcon(tab.id);
    }
    return;
  }
  if (injectFailedTabs.has(tab.id)) {
    await markUnavailableAfterClick(tab.id);
    if (await usesColoredTabIcon()) {
      await resetActionIcon(tab.id);
    }
    return;
  }
  await markAvailable(tab.id);
  if (await usesColoredTabIcon()) {
    await resetActionIcon(tab.id);
  }
}

function refreshAllTabs() {
  return browser.tabs
    .query({})
    .then((tabs) => Promise.all(tabs.map((tab) => updateActionForTab(tab))));
}

async function isContentScriptMarkerPresent(tabId) {
  try {
    const [probe] = await browser.scripting.executeScript({
      target: { tabId },
      func: (marker) => Boolean(globalThis[marker]),
      args: [CONTENT_SCRIPT_MARKER],
    });
    return probe?.result === true;
  } catch {
    return false;
  }
}

async function isContentScriptReady(tabId) {
  try {
    await browser.tabs.sendMessage(tabId, { type: 'ping' });
    return true;
  } catch {
    return isContentScriptMarkerPresent(tabId);
  }
}

async function ensureContentScript(tabId) {
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

async function sendClickToTab(tabId, config) {
  return browser.tabs.sendMessage(tabId, {
    type: type.click,
    config,
  });
}

browser.action.onClicked.addListener(async (tab) => {
  if (!isWebPage(tab.url)) {
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

browser.runtime.onMessage.addListener((message, sender) => {
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
        .then((v) => ({ ...variables.config.default, ...v }[message.key]));
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
});

async function clearLegacyTabIcons() {
  const tabs = await browser.tabs.query({});
  await Promise.all(
    tabs.map((tab) => (tab.id == null ? null : resetActionIcon(tab.id))),
  );
}

async function initActionState() {
  await setGlobalDefaultActionIcon();
  if (!(await usesColoredTabIcon())) {
    await clearLegacyTabIcons();
  }
  await browser.action.disable();
  await refreshAllTabs();
}

browser.runtime.onInstalled.addListener(async () => {
  try {
    await browser.scripting.unregisterContentScripts({
      ids: ['anchor-selector'],
    });
  } catch {
    // not registered
  }
  await initActionState();
});

browser.runtime.onStartup.addListener(initActionState);
