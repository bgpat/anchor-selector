import browser from 'webextension-polyfill';

const btnSite = document.getElementById('grant-site');
const btnAll = document.getElementById('grant-all');
let currentTab = null;
let originPattern = null;

browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  currentTab = tab;
  try {
    const url = new URL(tab.url);
    originPattern = `${url.protocol}//${url.host}/*`;
  } catch (e) {
    btnSite.disabled = true;
    btnSite.textContent = 'Cannot access this page';
  }
});

async function onGranted() {
  await browser.runtime.sendMessage({ type: 'permissions-changed' });
  window.close();
}

btnSite.addEventListener('click', async () => {
  if (!originPattern) return;
  const granted = await browser.permissions.request({
    origins: [originPattern],
  });
  if (granted) await onGranted();
});

btnAll.addEventListener('click', async () => {
  const granted = await browser.permissions.request({
    origins: ['*://*/*'],
  });
  if (granted) await onGranted();
});
