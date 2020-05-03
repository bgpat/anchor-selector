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
