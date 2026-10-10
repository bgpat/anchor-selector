import browser from 'webextension-polyfill';
import { type, variables, makeActiveIcon } from '@/util';

const selectingTabs = new Set();

function isWebPage(url) {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

async function isContentScriptReady(tabId) {
  try {
    await browser.tabs.sendMessage(tabId, { type: 'ping' });
    return true;
  } catch {
    return false;
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

browser.action.onClicked.addListener(async (tab) => {
  if (!isWebPage(tab.url)) {
    return;
  }
  try {
    if (!(await isContentScriptReady(tab.id))) {
      await ensureContentScript(tab.id);
    }
  } catch {
    return;
  }
  await browser.action.setTitle({
    tabId: tab.id,
    title: 'jump to the anchored element',
  });
  const config = await variables.config.getAll();
  await browser.tabs.sendMessage(tab.id, {
    type: type.click,
    config,
  });
});

browser.runtime.onMessage.addListener((message, sender) => {
  switch (message.type) {
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
      browser.action.setIcon({
        path: 'icons/anchor-selector.svg',
        tabId: sender.tab.id,
      });
      break;
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

browser.runtime.onInstalled.addListener(async () => {
  try {
    await browser.scripting.unregisterContentScripts({
      ids: ['anchor-selector'],
    });
  } catch {
    // not registered
  }
});
