import browser from 'webextension-polyfill';

const btnSite = document.getElementById('grant-site');
const btnAll = document.getElementById('grant-all');
let originPattern = null;
let activeTabId = null;

browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  activeTabId = tab.id;
  try {
    const url = new URL(tab.url);
    originPattern = `${url.protocol}//${url.host}/*`;
  } catch (e) {
    btnSite.disabled = true;
    btnSite.textContent = 'Cannot access this page';
  }
});

async function afterPermissionRequest(granted) {
  if (granted) {
    await browser.runtime.sendMessage({
      type: 'permissions-changed',
      tabId: activeTabId,
    });
  }
  window.close();
}

btnSite.addEventListener('click', async () => {
  if (!originPattern) return;
  const granted = await browser.permissions.request({
    origins: [originPattern],
  });
  await afterPermissionRequest(granted);
});

btnAll.addEventListener('click', async () => {
  const granted = await browser.permissions.request({
    origins: ['*://*/*'],
  });
  await afterPermissionRequest(granted);
});
