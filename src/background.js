import browser from 'webextension-polyfill';
import { type, variables, makeActiveIcon } from '@/util';

browser.action.disable();

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
      browser.action.setTitle({
        title: 'jump to the anchored element',
        tabId: sender.tab.id,
      });
      browser.action.setIcon({
        path: 'icons/anchor-selector.svg',
        tabId: sender.tab.id,
      });
      browser.action.enable(sender.tab.id);
      break;
    case 'open':
      makeActiveIcon().then((img) =>
        browser.action.setIcon({
          imageData: img,
          tabId: sender.tab.id,
        }),
      );
      break;
    case 'close':
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
