import { browser } from 'wxt/browser';
import {
  clickActionName,
  defaultClickAction,
  keySignature,
  type ClickActionName,
} from '@/util/config';
import Container from './container';
import { variables } from '@/util';

type ClickModifiers = Partial<
  Pick<MouseEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>
>;

let current: Overlay | null = null;

export default class Overlay {
  static get isActive() {
    return current != null;
  }

  static get current(): Overlay | null {
    return current;
  }

  declare container: Container;
  declare callback: () => unknown;
  declare onConfigChanged: (changes: {
    [key: string]: { newValue?: unknown };
  }) => void;

  constructor(config: { hue: number }, callback: () => unknown) {
    this.container = new Container(this, config);
    this.container.appendTo(document.body);
    this.callback = callback;
    this.onConfigChanged = (changes) => {
      if (!this.selecting) {
        return;
      }
      const hue = changes.hue?.newValue;
      if (typeof hue !== 'number') {
        return;
      }
      this.container.setHue(hue);
    };
    browser.storage.sync.onChanged.addListener(this.onConfigChanged);
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
      const pressed = (['alt', 'ctrl', 'meta', 'shift'] as const).filter(
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
        browser.runtime.sendMessage({ type: 'new-tab', url: url.href });
        break;
      case clickActionName.openNewWindow:
        browser.runtime.sendMessage({ type: 'new-window', url: url.href });
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
      browser.storage.sync.onChanged.removeListener(this.onConfigChanged);
      this.container.remove();
      current = null;
    }
    return Promise.resolve(this.callback());
  }
}
