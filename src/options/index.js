import browser from 'webextension-polyfill';
import { variables } from '@/util';

import click from './click';
import hue from './hue';

const form = document.forms.config;
const options = { click, hue };

form.addEventListener('input', async (e) => {
  await Promise.all(
    Object.entries(options).map(([key, option]) => {
      const value = option.update(e);
      if (value != null) {
        return variables.config.set(key, value);
      }
      if (option.render != null) {
        option.render(value);
      }
    }),
  );
  reload();
});

form.addEventListener('reset', async () => {
  if (confirm('Do you reset to default?')) {
    await Promise.all(
      Object.entries(variables.config.default).map(([k, v]) =>
        variables.config.set(k, v),
      ),
    );
  }
  reload();
});

function reload() {
  variables.config.getAll().then((config) => {
    form.style.display = 'block';
    Object.values(options).forEach((option) => option.load(config));
  });
}

reload();

const ALL_ORIGINS = { origins: ['*://*/*'] };
const toggleBtn = document.getElementById('toggle-permissions');
const statusEl = document.getElementById('permission-status');

async function updatePermissionUI() {
  const granted = await browser.permissions.contains(ALL_ORIGINS);
  statusEl.textContent = granted
    ? 'Enabled on all sites.'
    : 'No sites enabled.';
  toggleBtn.textContent = granted
    ? 'Disable all site access'
    : 'Enable on all sites (Recommended)';
}

toggleBtn.addEventListener('click', async () => {
  const granted = await browser.permissions.contains(ALL_ORIGINS);
  if (granted) {
    await browser.permissions.remove(ALL_ORIGINS);
  } else {
    await browser.permissions.request(ALL_ORIGINS);
  }
  updatePermissionUI();
});

updatePermissionUI();
