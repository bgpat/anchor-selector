import browser from 'webextension-polyfill';
import { type, variables, makeActiveIcon } from '@/util';

const DEFAULT_ICON = { path: 'icons/anchor-selector.svg' };
const CONTENT_SCRIPT_ID = 'anchor-selector';
const BADGE_NEEDS_ACCESS = '?';
const BADGE_NEEDS_ACCESS_COLOR = '#E65100';
const selectingTabs = new Set();

async function setNeedsAccessBadge(tabId) {
  await browser.action.setBadgeBackgroundColor({
    tabId,
    color: BADGE_NEEDS_ACCESS_COLOR,
  });
  await browser.action.setBadgeText({ tabId, text: BADGE_NEEDS_ACCESS });
}

async function clearAccessBadge(tabId) {
  await browser.action.setBadgeText({ tabId, text: '' });
}

function originPatternFromUrl(url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }
    return `${parsed.protocol}//${parsed.host}/*`;
  } catch {
    return null;
  }
}

async function hasOriginPermission(url) {
  const pattern = originPatternFromUrl(url);
  if (!pattern) {
    return false;
  }
  const { origins = [] } = await browser.permissions.getAll();
  if (origins.includes('*://*/*') || origins.includes(pattern)) {
    return true;
  }
  return browser.permissions.contains({ origins: [pattern] });
}

async function isContentScriptReady(tabId) {
  try {
    await browser.tabs.sendMessage(tabId, { type: 'ping' });
    return true;
  } catch {
    return false;
  }
}

async function ensureContentScriptOnTab(tab) {
  if (tab.id == null) {
    return;
  }
  let url = tab.url;
  if (!url) {
    try {
      url = (await browser.tabs.get(tab.id)).url;
    } catch {
      return;
    }
  }
  const pattern = originPatternFromUrl(url);
  if (!pattern) {
    return;
  }
  if (!(await hasOriginPermission(url))) {
    return;
  }
  if (await isContentScriptReady(tab.id)) {
    return;
  }
  try {
    await browser.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['dist/content_script.js'],
    });
    await browser.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['stylesheets/overlay.css'],
    });
  } catch {
    // e.g. chrome:// pages
  }
}

async function ensureContentScriptsOnAllTabs() {
  const tabs = await browser.tabs.query({});
  await Promise.all(tabs.map((tab) => ensureContentScriptOnTab(tab)));
}

async function syncContentScripts() {
  const { origins = [] } = await browser.permissions.getAll();
  const registered = await browser.scripting.getRegisteredContentScripts();
  const exists = registered.some((r) => r.id === CONTENT_SCRIPT_ID);

  if (origins.length === 0) {
    if (exists) {
      await browser.scripting.unregisterContentScripts({
        ids: [CONTENT_SCRIPT_ID],
      });
    }
    return;
  }

  const script = {
    id: CONTENT_SCRIPT_ID,
    matches: origins,
    js: ['dist/content_script.js'],
    css: ['stylesheets/overlay.css'],
  };

  if (exists) {
    await browser.scripting.updateContentScripts([script]);
  } else {
    await browser.scripting.registerContentScripts([script]);
  }
}

async function updateActionIconForTab(tab) {
  if (tab.id == null || selectingTabs.has(tab.id)) {
    return;
  }
  let url = tab.url;
  if (!url) {
    try {
      url = (await browser.tabs.get(tab.id)).url;
    } catch {
      return;
    }
  }
  const pattern = originPatternFromUrl(url);
  if (!pattern) {
    await browser.action.setIcon({ tabId: tab.id, ...DEFAULT_ICON });
    await clearAccessBadge(tab.id);
    return;
  }
  const granted = await hasOriginPermission(url);
  if (!granted) {
    await browser.action.setIcon({ tabId: tab.id, ...DEFAULT_ICON });
    await setNeedsAccessBadge(tab.id);
    await browser.action.setPopup({ tabId: tab.id, popup: 'popup.html' });
    await browser.action.setTitle({
      tabId: tab.id,
      title: 'Anchor Selector — allow site access to use',
    });
    return;
  }
  await browser.action.setIcon({ tabId: tab.id, ...DEFAULT_ICON });
  await clearAccessBadge(tab.id);
  await browser.action.setPopup({ tabId: tab.id, popup: '' });
  await browser.action.setTitle({
    tabId: tab.id,
    title: 'jump to the anchored element',
  });
}

function refreshAllTabIcons() {
  return browser.tabs.query({}).then((tabs) =>
    Promise.all(tabs.map((tab) => updateActionIconForTab(tab))),
  );
}

async function onPermissionsChanged(focusTabId) {
  await syncContentScripts();
  await ensureContentScriptsOnAllTabs();
  await refreshAllTabIcons();
  if (focusTabId != null) {
    try {
      await updateActionIconForTab(await browser.tabs.get(focusTabId));
    } catch {
      // tab may have closed
    }
  }
}

browser.tabs.onActivated.addListener(({ tabId }) => {
  browser.tabs.get(tabId).then(updateActionIconForTab);
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    updateActionIconForTab({ ...tab, id: tabId });
  }
});

browser.permissions.onAdded.addListener(() => onPermissionsChanged());
browser.permissions.onRemoved.addListener(() => onPermissionsChanged());

browser.action.onClicked.addListener(async (tab) => {
  if (!(await hasOriginPermission(tab.url))) {
    return;
  }
  const config = await variables.config.getAll();
  await browser.tabs.sendMessage(tab.id, {
    type: type.click,
    config,
  });
});

browser.runtime.onMessage.addListener((message, sender) => {
  switch (message.type) {
    case 'load':
      return hasOriginPermission(sender.url).then((granted) => {
        if (!granted) {
          return;
        }
        browser.action.setPopup({ tabId: sender.tab.id, popup: '' });
        browser.action.setTitle({
          title: 'jump to the anchored element',
          tabId: sender.tab.id,
        });
        browser.action.setIcon({
          path: 'icons/anchor-selector.svg',
          tabId: sender.tab.id,
        });
        clearAccessBadge(sender.tab.id);
      });
    case 'open':
      selectingTabs.add(sender.tab.id);
      return makeActiveIcon().then((img) =>
        browser.action.setIcon({
          imageData: img,
          tabId: sender.tab.id,
        }),
      );
    case 'close':
      selectingTabs.delete(sender.tab.id);
      return updateActionIconForTab({ id: sender.tab.id });
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
    case 'permissions-changed':
      return onPermissionsChanged(message.tabId);
  }
});

browser.runtime.onInstalled.addListener(async () => {
  await syncContentScripts();
  await refreshAllTabIcons();
});

browser.runtime.onStartup.addListener(async () => {
  await syncContentScripts();
  await refreshAllTabIcons();
});
