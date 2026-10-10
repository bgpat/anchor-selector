import browser from 'webextension-polyfill';
import {
  type,
  variables,
  makeDefaultIcon,
  makeIconWithNotificationDot,
  CONTENT_SCRIPT_MARKER,
} from '@/util';

function getDefaultIconPaths() {
  const png = browser.runtime.getURL('icons/anchor-selector.png');
  return { 16: png, 32: png, 48: png };
}

const selectingTabs = new Set();
/** Tabs where inject failed after a toolbar click (show badge until URL changes). */
const injectFailedTabs = new Set();
/** Ignore stale icon updates after selection ends. */
const selectionIconEpoch = new Map();
function cloneImageData(src) {
  return new ImageData(
    new Uint8ClampedArray(src.data),
    src.width,
    src.height,
  );
}

let tabIconDotSupportedPromise = null;

/** Chromium often keeps tab action imageData until navigation; avoid dot overlays there. */
async function tabIconDotSupported() {
  if (!tabIconDotSupportedPromise) {
    tabIconDotSupportedPromise = (async () => {
      if (typeof browser.runtime.getBrowserInfo !== 'function') {
        return false;
      }
      try {
        const { name } = await browser.runtime.getBrowserInfo();
        return name === 'Firefox';
      } catch {
        return false;
      }
    })();
  }
  return tabIconDotSupportedPromise;
}

/** Clear per-tab icon override (dot overlay or legacy full tint). */
async function resetActionIcon(tabId) {
  const imageData = await makeDefaultIcon();
  await browser.action.setIcon({ tabId, imageData }).catch(() => {});
  await browser.action
    .setIcon({ tabId, imageData: {} })
    .catch(() => {});
  await browser.action
    .setIcon({ tabId, path: getDefaultIconPaths() })
    .catch(() => {});
}

async function setGlobalDefaultActionIcon() {
  await browser.action.setIcon({ path: getDefaultIconPaths() });
}

async function endSelectionForTab(tabId) {
  selectingTabs.delete(tabId);
  selectionIconEpoch.set(tabId, (selectionIconEpoch.get(tabId) ?? 0) + 1);
  await resetActionIcon(tabId);
  await updateActionForTab({ id: tabId });
}

async function startSelectionForTab(tabId) {
  selectingTabs.add(tabId);
  try {
    if (await tabIconDotSupported()) {
      const epochAtOpen = selectionIconEpoch.get(tabId) ?? 0;
      const imageData = await makeIconWithNotificationDot();
      if ((selectionIconEpoch.get(tabId) ?? 0) !== epochAtOpen) {
        return;
      }
      if (!selectingTabs.has(tabId)) {
        return;
      }
      await browser.action.setIcon({
        tabId,
        imageData: cloneImageData(imageData),
      });
      return;
    }
    await browser.action.setTitle({ tabId, title: TITLE_SELECTING });
  } catch {
    selectingTabs.delete(tabId);
    await updateActionForTab({ id: tabId });
  }
}

async function applyOverlayClickResult(tabId, result) {
  if (result?.overlayActive === false) {
    return;
  }
  if (result?.overlayActive === true || result == null) {
    await startSelectionForTab(tabId);
  }
}

const TITLE_READY = 'jump to the anchored element';
const TITLE_SELECTING =
  'Selecting anchor — click extension icon to cancel';
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
    await resetActionIcon(tab.id);
    return;
  }
  if (injectFailedTabs.has(tab.id)) {
    await markUnavailableAfterClick(tab.id);
    await resetActionIcon(tab.id);
    return;
  }
  await markAvailable(tab.id);
  await resetActionIcon(tab.id);
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
  await clearLegacyTabIcons();
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
