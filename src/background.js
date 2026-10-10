import browser from 'webextension-polyfill';
import { type, variables, makeActiveIcon, makeLockedIcon } from '@/util';

const DEFAULT_ICON = { path: 'icons/anchor-selector.svg' };
const selectingTabs = new Set();

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
    return;
  }
  const granted = await browser.permissions.contains({ origins: [pattern] });
  if (!granted) {
    const imageData = await makeLockedIcon();
    await browser.action.setIcon({ tabId: tab.id, imageData });
    await browser.action.setPopup({ tabId: tab.id, popup: 'popup.html' });
    await browser.action.setTitle({
      tabId: tab.id,
      title: 'Anchor Selector — allow site access to use',
    });
    return;
  }
  await browser.action.setIcon({ tabId: tab.id, ...DEFAULT_ICON });
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

browser.tabs.onActivated.addListener(({ tabId }) => {
  browser.tabs.get(tabId).then(updateActionIconForTab);
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    updateActionIconForTab({ ...tab, id: tabId });
  }
});

browser.permissions.onAdded.addListener(refreshAllTabIcons);
browser.permissions.onRemoved.addListener(refreshAllTabIcons);

browser.action.onClicked.addListener((tab) => {
  variables.config.getAll().then((config) =>
    browser.tabs.sendMessage(tab.id, {
      type: type.click,
      config,
    }),
  );
});

browser.runtime.onMessage.addListener((message, sender) => {
  switch (message.type) {
    case 'load':
      browser.action.setPopup({ tabId: sender.tab.id, popup: '' });
      browser.action.setTitle({
        title: 'jump to the anchored element',
        tabId: sender.tab.id,
      });
      browser.action.setIcon({
        path: 'icons/anchor-selector.svg',
        tabId: sender.tab.id,
      });
      break;
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
  }
});

browser.runtime.onInstalled.addListener(async ({ reason }) => {
  const registered = await browser.scripting.getRegisteredContentScripts();
  if (registered.length === 0) {
    await browser.scripting.registerContentScripts([
      {
        id: 'anchor-selector',
        matches: ['*://*/*'],
        js: ['dist/content_script.js'],
        css: ['stylesheets/overlay.css'],
      },
    ]);
  }
  await refreshAllTabIcons();
  if (reason === 'install') {
    browser.runtime.openOptionsPage();
  }
});

browser.runtime.onStartup.addListener(refreshAllTabIcons);
