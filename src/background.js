import { type } from '@/util';

chrome.pageAction.onClicked.addListener(tab => {
  chrome.tabs.sendMessage(tab.id, { type: type.click });
});

chrome.runtime.onMessage.addListener((message, sender) => {
  switch (message.type) {
    case 'load':
      chrome.pageAction.setTitle({
        title: 'jump to the anchored element',
        tabId: sender.tab.id,
      });
      chrome.pageAction.setIcon({
        path: '../icons/anchor-selector.svg',
        tabId: sender.tab.id,
      });
      chrome.pageAction.show(sender.tab.id);
      break;
    case 'open':
      chrome.pageAction.setIcon({
        path: '../icons/active.svg',
        tabId: sender.tab.id,
      });
      break;
    case 'close':
      chrome.pageAction.setIcon({
        path: '../icons/anchor-selector.svg',
        tabId: sender.tab.id,
      });
      break;
    case '':
      break;
  }
});
