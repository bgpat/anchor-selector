import { type, makeActiveIcon } from '@/util';

let activeIcon;
makeActiveIcon().then(img => (activeIcon = img));

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
      if (activeIcon == null) {
        break;
      }
      chrome.pageAction.setIcon({
        imageData: activeIcon,
        tabId: sender.tab.id,
      });
      break;
    case 'close':
      chrome.pageAction.setIcon({
        path: '../icons/anchor-selector.svg',
        tabId: sender.tab.id,
      });
      break;
  }
});
