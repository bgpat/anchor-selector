import browser from 'webextension-polyfill';

const variables = {
  config: {
    default: {
      hue: 330,
      click: [
        { action: 'replace-address-bar', keys: [] },
        { action: 'open-new-tab', keys: ['ctrl'] },
        { action: 'open-new-window', keys: ['shift'] },
        { action: 'open-new-tab', keys: ['meta'] },
      ],
    },
    async get(key) {
      return browser.runtime
        .sendMessage({
          type: 'get-config',
          key,
        })
        .catch(() =>
          browser.storage.sync
            .get(key)
            .then((v) => ({ ...variables.config.default, ...v }[key])),
        );
    },
    async set(key, value) {
      return browser.runtime.sendMessage({ type: 'set-config', key, value });
    },
    async getAll() {
      return Promise.all(
        Object.keys(this.default).map((k) =>
          this.get(k).then((v) => ({ [k]: v })),
        ),
      ).then((v) => v.reduce((a, c) => ({ ...a, ...c })));
    },
  },
  overlay: {
    class: '--anchor-selector-overlay',
    selecting: {
      duration: '0.15s',
      stroke: {
        saturation: 100,
        lightness: 50,
        alpha: 0.9,
      },
      fill: {
        saturation: 39,
        lightness: 73,
        alpha: 0.24,
      },
    },
    label: {
      margin: 4,
    },
  },
  animation: {
    ease: {
      keySplines: '0.42 0 0.58 1',
      calcMode: 'spline',
    },
  },
};

export default variables;
