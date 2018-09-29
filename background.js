browser.pageAction.onClicked.addListener((tab) => {
  browser.tabs.sendMessage(tab.id, {
    action: 'click',
  });
});

browser.runtime.onMessage.addListener((req, sender, sendResponse) => {
});
