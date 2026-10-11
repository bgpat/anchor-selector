import { browser } from 'wxt/browser';
import {
  clickActionName,
  cloneStoredConfig,
  defaultClickAction,
  type ConfigKey,
  type StoredConfig,
} from './config';

const defaultConfig: StoredConfig = {
  hue: 330,
  click: [
    { action: defaultClickAction, keys: [] },
    { action: clickActionName.openNewTab, keys: ['ctrl'] },
    { action: clickActionName.openNewWindow, keys: ['shift'] },
    { action: clickActionName.openNewTab, keys: ['meta'] },
  ],
};

function mergeWithDefaults(partial: Partial<StoredConfig>): StoredConfig {
  return { ...cloneStoredConfig(defaultConfig), ...partial };
}

async function readFromStorage<K extends ConfigKey>(
  key: K,
): Promise<StoredConfig[K]> {
  const stored = await browser.storage.sync.get(key);
  const merged = mergeWithDefaults(stored);
  if (key === 'click') {
    return cloneStoredConfig(merged).click as StoredConfig[K];
  }
  return merged[key] as StoredConfig[K];
}

async function writeToStorage<K extends ConfigKey>(
  key: K,
  value: StoredConfig[K],
): Promise<void> {
  await browser.storage.sync.set({ [key]: value });
}

const variables = {
  config: {
    default: defaultConfig,
    async get<K extends ConfigKey>(key: K): Promise<StoredConfig[K]> {
      try {
        return (await browser.runtime.sendMessage({
          type: 'get-config',
          key,
        })) as StoredConfig[K];
      } catch {
        return readFromStorage(key);
      }
    },
    async set<K extends ConfigKey>(key: K, value: StoredConfig[K]) {
      try {
        await browser.runtime.sendMessage({ type: 'set-config', key, value });
      } catch {
        await writeToStorage(key, value);
      }
    },
    async resetToDefaults(): Promise<StoredConfig> {
      const defaults = cloneStoredConfig(defaultConfig);
      try {
        await browser.runtime.sendMessage({ type: 'reset-config' });
      } catch {
        await browser.storage.sync.set(defaults);
      }
      return defaults;
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
