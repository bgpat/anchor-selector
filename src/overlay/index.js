import browser from 'webextension-polyfill';
import Container from './container';
import { variables } from '@/util';

let current = null;

export default class Overlay {
  static get isActive() {
    return current != null;
  }

  static get current() {
    return current;
  }

  constructor(config, callback) {
    this.container = new Container(this, config);
    this.container.appendTo(document.body);
    this.callback = callback;
    current = this;
  }

  get selecting() {
    return this === current;
  }

  async select(id, e = {}, action) {
    let url = new URL(location);
    url.hash = id == null ? url.hash : `#${id}`;
    let config = await variables.config.getAll();
    if (action == null) {
      let match = config.click.find(
        (a) =>
          a.keys.sort().join('\0') ===
          ['alt', 'ctrl', 'meta', 'shift']
            .filter((k) => e[`${k}Key`])
            .join('\0'),
      );
      if (match) {
        action = match.action;
      }
    }
    switch (action) {
      case 'open-current': // deprecated
      case 'replace-address-bar':
        history.pushState(null, null, url.hash);
        break;
      case 'open-new': // deprecated
      case 'open-new-tab':
        browser.runtime.sendMessage({ type: 'new-tab', url: url.href });
        break;
      case 'open-new-window':
        browser.runtime.sendMessage({ type: 'new-window', url: url.href });
        break;
      case 'copy-url':
        browser.runtime.sendMessage({ type: 'copy', text: url.href });
        break;
      case 'copy-hash':
        browser.runtime.sendMessage({ type: 'copy', text: url.hash });
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
    this.callback();
  }
}
