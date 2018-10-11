browser.pageAction.onClicked.addListener((tab) => {
  browser.tabs.sendMessage(tab.id, {
    action: 'click',
  });
});
