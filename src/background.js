import { type } from '@/util';

browser.pageAction.onClicked.addListener((tab) => {
  browser.tabs.sendMessage(tab.id, {
    type: type.click,
  });
});
