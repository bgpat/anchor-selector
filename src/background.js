import browser from 'webextension-polyfill';
import {
  type,
  variables,
  makeActiveIcon,
  CONTENT_SCRIPT_MARKER,
} from '@/util';

const selectingTabs = new Set();
/** Tabs where inject failed after a toolbar click (show badge until URL changes). */
const injectFailedTabs = new Set();
/** Bumped on close so in-flight makeActiveIcon cannot repaint after overlay ends. */
const actionIconEpoch = new Map();
const DEFAULT_ACTION_ICON = {
  path: {
    16: 'icons/anchor-selector.png',
    32: 'icons/anchor-selector.png',
    48: 'icons/anchor-selector.png',
  },
};

async function resetActionIcon(tabId) {
  await browser.action.setIcon({ tabId, ...DEFAULT_ACTION_ICON });
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
  await browser.tabs.sendMessage(tabId, {
    type: type.click,
    config,
  });
}

browser.action.onClicked.addListener(async (tab) => {
  if (!isWebPage(tab.url)) {
    return;
  }
  const config = await variables.config.getAll();
  if (selectingTabs.has(tab.id)) {
    try {
      await sendClickToTab(tab.id, config);
    } catch {
      selectingTabs.delete(tab.id);
      await updateActionForTab(tab);
    }
    return;
  }
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
    await sendClickToTab(tab.id, config);
  } catch {
    await markUnavailableAfterClick(tab.id);
  }
});

browser.runtime.onMessage.addListener((message, sender) => {
  switch (message.type) {
    case 'open': {
      const tabId = sender.tab.id;
      selectingTabs.add(tabId);
      const epochAtOpen = actionIconEpoch.get(tabId) ?? 0;
      return makeActiveIcon()
        .then((img) => {
          if ((actionIconEpoch.get(tabId) ?? 0) !== epochAtOpen) {
            return;
          }
          if (!selectingTabs.has(tabId)) {
            return;
          }
          return browser.action.setIcon({
            imageData: img,
            tabId,
          });
        })
        .catch(() => {
          selectingTabs.delete(tabId);
          return updateActionForTab({ id: tabId });
        });
    }
    case 'close': {
      const tabId = sender.tab.id;
      selectingTabs.delete(tabId);
      actionIconEpoch.set(tabId, (actionIconEpoch.get(tabId) ?? 0) + 1);
      return resetActionIcon(tabId).then(() =>
        updateActionForTab({ id: tabId }),
      );
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

async function initActionState() {
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
