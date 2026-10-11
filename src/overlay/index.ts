import { browser } from 'wxt/browser';
import { keySignature, type ClickActionName } from '@/util/config';
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

  constructor(config: { hue: number }, callback: () => unknown) {
    this.container = new Container(this, config);
    this.container.appendTo(document.body);
    this.callback = callback;
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
      case 'open-current': // deprecated
      case 'replace-address-bar':
        history.pushState(null, '', url.hash);
        break;
      case 'open-new': // deprecated
      case 'open-new-tab':
        browser.runtime.sendMessage({ type: 'new-tab', url: url.href });
        break;
      case 'open-new-window':
        browser.runtime.sendMessage({ type: 'new-window', url: url.href });
        break;
      case 'copy-url':
        navigator.clipboard.writeText(url.href);
        break;
      case 'copy-hash':
        navigator.clipboard.writeText(url.hash);
        break;
      default:
        return this.select(id, null, 'replace-address-bar');
    }
    this.close();
  }

  close() {
    if (this.selecting) {
      this.container.remove();
      current = null;
    }
    return Promise.resolve(this.callback());
  }
}
