import { browser } from 'wxt/browser';
import {
  runtimeMessageType,
  variables,
  getSelectingBadgeStyle,
} from '@/util';
import {
  cloneStoredConfig,
  configKey,
  type ConfigKey,
  type StoredConfig,
} from '@/util/config';

type BrowserActionApi = typeof browser.action;

/** Firefox MV2 exposes this as `browser.browserAction`; MV3 and Chrome use `browser.action`. */
function browserActionApi(): BrowserActionApi {
  const firefoxAction = (
    browser as typeof browser & { browserAction?: BrowserActionApi }
  ).browserAction;
  if (browser.action) {
    return browser.action;
  }
  if (firefoxAction) {
    return firefoxAction;
  }
  return browser.action;
}

type OverlayState = { overlayActive?: boolean };

type RuntimeMessage =
  | { type: typeof runtimeMessageType.getState }
  | {
      type: typeof runtimeMessageType.setSelection;
      active: boolean;
      config: StoredConfig;
    }
  | {
      type: typeof runtimeMessageType.contentScriptReady;
      injected: boolean;
    }
  | { type: typeof runtimeMessageType.selectionEnded }
  | { type: typeof runtimeMessageType.getConfig; key: ConfigKey }
  | {
      type: typeof runtimeMessageType.setConfig;
      key: ConfigKey;
      value: StoredConfig[ConfigKey];
    }
  | { type: typeof runtimeMessageType.newTab; url: string }
  | { type: typeof runtimeMessageType.newWindow; url: string }
  | { type: typeof runtimeMessageType.toggleSelectionTab; tabId: number };

const tabChains = new Map<number, Promise<unknown>>();

function runExclusive<T>(tabId: number, fn: () => Promise<T>): Promise<T> {
  const prev = tabChains.get(tabId) ?? Promise.resolve();
  const result = prev.then(fn, fn);
  tabChains.set(
    tabId,
    result.then(
      () => undefined,
      () => undefined,
    ),
  );
  return result;
}

async function showSelectingBadge(tabId: number) {
  const { background, text, textColor } = await getSelectingBadgeStyle();
  await browserActionApi().setBadgeBackgroundColor({ tabId, color: background });
  await browserActionApi().setBadgeTextColor({ tabId, color: textColor });
  await browserActionApi().setBadgeText({ tabId, text });
}

async function setBadge(tabId: number, active: boolean) {
  if (!active) {
    await browserActionApi().setBadgeText({ tabId, text: '' });
    return;
  }
  await showSelectingBadge(tabId);
}

async function getState(tabId: number): Promise<OverlayState | undefined> {
  try {
    return (await browser.tabs.sendMessage(tabId, {
      type: runtimeMessageType.getState,
    })) as OverlayState;
  } catch {
    return undefined;
  }
}

async function injectContentScriptBundle(tabId: number) {
  await browser.scripting.executeScript({
    target: { tabId },
    files: ['/content_script.js'],
  });
  await browser.scripting.insertCSS({
    target: { tabId },
    files: ['/assets/overlay.css'],
  });
}

/** Returns page state after the content script can answer, or undefined if injection is impossible. */
async function ensureInjected(tabId: number): Promise<OverlayState | undefined> {
  const existing = await getState(tabId);
  if (existing != null) {
    return existing;
  }
  try {
    await injectContentScriptBundle(tabId);
  } catch {
    return undefined;
  }
  return getState(tabId);
}

async function setSelection(
  tabId: number,
  active: boolean,
  config: StoredConfig,
): Promise<OverlayState | undefined> {
  try {
    return (await browser.tabs.sendMessage(tabId, {
      type: runtimeMessageType.setSelection,
      active,
      config,
    })) as OverlayState;
  } catch {
    return undefined;
  }
}

async function reconcile(tabId: number) {
  const state = await getState(tabId);
  await setBadge(tabId, state?.overlayActive === true);
}

async function toggleSelection(tabId: number) {
  const config = await variables.config.getAll();
  const state = await ensureInjected(tabId);
  if (state == null) {
    await setBadge(tabId, false);
    return;
  }
  const result = await setSelection(tabId, state.overlayActive !== true, config);
  await setBadge(tabId, result?.overlayActive === true);
}

const TITLE_READY = 'jump to the anchored element';

async function tabHasSelectingBadge(tabId: number) {
  try {
    const text = await browserActionApi().getBadgeText({ tabId });
    return text !== '';
  } catch {
    return false;
  }
}

export function registerBackground() {
  const selectionPorts = new Set<ReturnType<typeof browser.runtime.connect>>();
  browser.runtime.onConnect.addListener((port) => {
    selectionPorts.add(port);
    const tabId = port.sender?.tab?.id;
    port.onDisconnect.addListener(() => {
      selectionPorts.delete(port);
      if (tabId == null) {
        return;
      }
      void runExclusive(tabId, () => setBadge(tabId, false));
    });
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading') {
      void runExclusive(tabId, () => setBadge(tabId, false));
    }
    if (changeInfo.status !== 'complete') {
      return;
    }
    void runExclusive(tabId, () => reconcile(tabId));
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    tabChains.delete(tabId);
  });

  browserActionApi().onClicked.addListener((tab) => {
    const tabId = tab.id;
    if (tabId == null) {
      return;
    }
    void runExclusive(tabId, () => toggleSelection(tabId));
  });

  browser.runtime.onMessage.addListener(
    (raw: unknown, sender: { tab?: { id?: number } }) => {
      const message = raw as RuntimeMessage;
      switch (message.type) {
        case runtimeMessageType.contentScriptReady: {
          const tabId = sender.tab?.id;
          if (tabId == null) {
            return;
          }
          return runExclusive(tabId, () => reconcile(tabId));
        }
        case runtimeMessageType.selectionEnded: {
          const tabId = sender.tab?.id;
          if (tabId == null) {
            return;
          }
          return runExclusive(tabId, () => reconcile(tabId));
        }
        case runtimeMessageType.getConfig:
          return browser.storage.sync.get(message.key).then((stored) => {
            const merged = {
              ...cloneStoredConfig(variables.config.default),
              ...stored,
            };
            if (message.key === configKey.click) {
              return cloneStoredConfig(merged)[configKey.click];
            }
            return merged[message.key] as StoredConfig[ConfigKey];
          });
        case runtimeMessageType.setConfig:
          return browser.storage.sync.set({ [message.key]: message.value });
        case runtimeMessageType.newTab:
          browser.tabs.create({ url: message.url });
          break;
        case runtimeMessageType.newWindow:
          browser.windows.create({ url: message.url });
          break;
        case runtimeMessageType.toggleSelectionTab:
          return runExclusive(message.tabId, () =>
            toggleSelection(message.tabId),
          );
      }
    },
  );

  async function initExtension() {
    await browserActionApi().setTitle({ title: TITLE_READY });
    const tabs = await browser.tabs.query({});
    await Promise.all(
      tabs.map(async (tab) => {
        if (tab.id == null) {
          return;
        }
        await browserActionApi().setBadgeText({ tabId: tab.id, text: '' });
      }),
    );
  }

  browser.runtime.onInstalled.addListener(initExtension);
  browser.runtime.onStartup.addListener(initExtension);

  browser.storage.sync.onChanged.addListener((changes) => {
    if (typeof changes[configKey.hue]?.newValue !== 'number') {
      return;
    }
    void browser.tabs.query({}).then((tabs) =>
      Promise.all(
        tabs.map(async (tab) => {
          if (tab.id == null || !(await tabHasSelectingBadge(tab.id))) {
            return;
          }
          await showSelectingBadge(tab.id).catch(() => {});
        }),
      ),
    );
  });
}
