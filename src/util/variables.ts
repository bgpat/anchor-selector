import browser from 'webextension-polyfill';
import type { ConfigKey, StoredConfig } from './config';

const defaultConfig: StoredConfig = {
  hue: 330,
  click: [
    { action: 'replace-address-bar', keys: [] },
    { action: 'open-new-tab', keys: ['ctrl'] },
    { action: 'open-new-window', keys: ['shift'] },
    { action: 'open-new-tab', keys: ['meta'] },
  ],
};

const variables = {
  config: {
    default: defaultConfig,
    async get<K extends ConfigKey>(
      key: K,
    ): Promise<StoredConfig[K]> {
      const fromRuntime = browser.runtime
        .sendMessage({
          type: 'get-config',
          key,
        })
        .catch(() =>
          browser.storage.sync.get(key).then((v) => {
            const merged = { ...variables.config.default, ...v };
            return merged[key];
          }),
        );
      return fromRuntime as Promise<StoredConfig[K]>;
    },
    async set<K extends ConfigKey>(key: K, value: StoredConfig[K]) {
      return browser.runtime.sendMessage({ type: 'set-config', key, value });
    },
    async getAll(): Promise<StoredConfig> {
      return Promise.all(
        (Object.keys(defaultConfig) as ConfigKey[]).map((k) =>
          this.get(k).then((v) => ({ [k]: v })),
        ),
      ).then((v) => v.reduce((a, c) => ({ ...a, ...c }), {}) as StoredConfig);
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
    strokeWidth: 3,
  },
  animation: {
    ease: {
      keySplines: '0.42 0 0.58 1',
      calcMode: 'spline',
    },
  },
  minimumDistance: 10,
};

export default variables;
