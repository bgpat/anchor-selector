import { type } from '@/util';

chrome.tabs.onUpdated.addListener(tabId => {
  try {
    chrome.pageAction.setIcon({
      path: '../icons/anchor-selector.svg',
      tabId,
    });
  } catch (e) {
    // no-op
  }
  chrome.pageAction.show(tabId);
});

chrome.pageAction.onClicked.addListener(tab => {
  chrome.tabs.sendMessage(tab.id, { type: type.click });
});

chrome.runtime.onMessage.addListener((message, sender) => {
  switch (message.type) {
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
