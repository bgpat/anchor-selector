import { browser } from 'wxt/browser';
import {
  clickActionName,
  configKey,
  defaultClickAction,
  keySignature,
  MODIFIER_KEY_PRESS_ORDER,
  type ClickActionName,
} from '@/util/config';
import Container from './container';
import { runtimeMessageType, variables } from '@/util';

type ClickModifiers = Partial<
  Pick<MouseEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>
>;

let current: Overlay | null = null;

/** Chrome may inject on `tabs` complete before `document.body` exists. */
export function waitForDocumentBody(): Promise<void> {
  if (document.body) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => resolve(), {
        once: true,
      });
      return;
    }
    const wait = () => {
      if (document.body) {
        resolve();
        return;
      }
      requestAnimationFrame(wait);
    };
    wait();
  });
}

export default class Overlay {
  static get isActive() {
    return current != null;
  }

  static get current(): Overlay | null {
    return current;
  }

  declare container: Container;
  declare callback: () => unknown;
  declare lifetimePort: ReturnType<typeof browser.runtime.connect> | null;
  declare ignorePortDisconnect: boolean;
  declare onConfigChanged: (changes: {
    [key: string]: { newValue?: unknown };
  }) => void;

  constructor(config: { hue: number }, callback: () => unknown) {
    this.lifetimePort = null;
    this.ignorePortDisconnect = false;
    this.container = new Container(this, config);
    this.container.appendTo(document.body);
    this.callback = callback;
    this.onConfigChanged = (changes) => {
      if (!this.selecting) {
        return;
      }
      const hue = changes[configKey.hue]?.newValue;
      if (typeof hue !== 'number') {
        return;
      }
      this.container.setHue(hue);
    };
    browser.storage.sync.onChanged.addListener(this.onConfigChanged);
    try {
      this.lifetimePort = browser.runtime.connect();
      this.lifetimePort.onDisconnect.addListener(() => {
        this.lifetimePort = null;
        if (this.ignorePortDisconnect) {
          return;
        }
        void this.close();
      });
    } catch {
      this.lifetimePort = null;
    }
    current = this;
  }

  get selecting() {
    return this === current;
  }

  async select(
    id: string | null | undefined,
    e: ClickModifiers | null = {},
    action?: ClickActionName,
  ): Promise<void> {
    if (!this.selecting) {
      return;
    }
    const url = new URL(location.href);
    url.hash = id == null ? url.hash : `#${id}`;
    const config = await variables.config.getAll();
    if (action == null) {
      const modifiers = e ?? {};
      const pressed = MODIFIER_KEY_PRESS_ORDER.filter(
        (k) => modifiers[`${k}Key`],
      );
      const match = config.click.find(
        (a) => keySignature(a.keys) === keySignature(pressed),
      );
      if (match) {
        action = match.action;
      }
    }
    switch (action) {
      case clickActionName.openCurrent:
      case clickActionName.replaceAddressBar:
        history.pushState(null, '', url.hash);
        break;
      case clickActionName.openNew:
      case clickActionName.openNewTab:
        browser.runtime.sendMessage({
          type: runtimeMessageType.newTab,
          url: url.href,
        });
        break;
      case clickActionName.openNewWindow:
        browser.runtime.sendMessage({
          type: runtimeMessageType.newWindow,
          url: url.href,
        });
        break;
      case clickActionName.copyUrl:
        navigator.clipboard.writeText(url.href);
        break;
      case clickActionName.copyHash:
        navigator.clipboard.writeText(url.hash);
        break;
      default:
        return this.select(id, null, defaultClickAction);
    }
    this.close();
  }

  close() {
    if (this.selecting) {
      this.ignorePortDisconnect = true;
      try {
        this.lifetimePort?.disconnect();
      } catch {
        // The port is already closed because the extension was disabled.
      }
      this.lifetimePort = null;
      try {
        browser.storage.sync.onChanged.removeListener(this.onConfigChanged);
      } catch {
        // The extension context is already gone.
      }
      this.container.disconnect();
      this.container.remove();
      current = null;
    }
    return Promise.resolve(this.callback());
  }
}
