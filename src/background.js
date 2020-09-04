import browser from 'webextension-polyfill';
import { type, variables, makeActiveIcon } from '@/util';

browser.pageAction.onClicked.addListener((tab) => {
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
      browser.pageAction.setTitle({
        title: 'jump to the anchored element',
        tabId: sender.tab.id,
      });
      browser.pageAction.setIcon({
        path: '../icons/anchor-selector.svg',
        tabId: sender.tab.id,
      });
      browser.pageAction.show(sender.tab.id);
      break;
    case 'open':
      makeActiveIcon().then((img) =>
        browser.pageAction.setIcon({
          imageData: img,
          tabId: sender.tab.id,
        }),
      );
      break;
    case 'close':
      browser.pageAction.setIcon({
        path: '../icons/anchor-selector.svg',
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
    case 'copy':
      navigator.clipboard.writeText(message.text).catch((e) => {
        // eslint-disable-next-line no-console
        console.warn('failed navigator.clipboard.writeText', e);
        const input = document.createElement('textarea');
        document.body.appendChild(input);
        input.value = message.text;
        input.focus();
        input.select();
        document.execCommand('Copy');
        input.remove();
      });
      break;
  }
});
