import {type} from '@/util';

chrome.tabs.onUpdated.addListener(tabId => {
  chrome.pageAction.show(tabId);
});

chrome.pageAction.onClicked.addListener(tab => {
  chrome.tabs.sendMessage(tab.id, {
    type: type.click,
  });
});
