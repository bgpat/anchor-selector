import browser from 'webextension-polyfill';

const btnSite = document.getElementById('grant-site');
const btnAll = document.getElementById('grant-all');
let originPattern = null;

browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  try {
    const url = new URL(tab.url);
    originPattern = `${url.protocol}//${url.host}/*`;
  } catch (e) {
    btnSite.disabled = true;
    btnSite.textContent = 'Cannot access this page';
  }
});

function afterPermissionRequest(granted) {
  window.close();
  if (granted) {
    browser.runtime.sendMessage({ type: 'permissions-changed' });
  }
}

btnSite.addEventListener('click', async () => {
  if (!originPattern) return;
  const granted = await browser.permissions.request({
    origins: [originPattern],
  });
  afterPermissionRequest(granted);
});

btnAll.addEventListener('click', async () => {
  const granted = await browser.permissions.request({
    origins: ['*://*/*'],
  });
  afterPermissionRequest(granted);
});
