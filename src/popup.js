import browser from 'webextension-polyfill';

const btn = document.getElementById('grant');
let currentTab = null;
let originPattern = null;

browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  currentTab = tab;
  try {
    const url = new URL(tab.url);
    originPattern = `${url.protocol}//${url.host}/*`;
  } catch (e) {
    btn.disabled = true;
    btn.textContent = 'Cannot access this page';
  }
});

btn.addEventListener('click', async () => {
  if (!originPattern) return;
  const granted = await browser.permissions.request({
    origins: [originPattern],
  });
  if (granted) {
    await browser.scripting.executeScript({
      target: { tabId: currentTab.id },
      files: ['dist/content_script.js'],
    });
    await browser.scripting.insertCSS({
      target: { tabId: currentTab.id },
      files: ['stylesheets/overlay.css'],
    });
    window.close();
  }
});
