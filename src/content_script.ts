import browser from 'webextension-polyfill';
import { type, CONTENT_SCRIPT_MARKER } from '@/util';
import type { StoredConfig } from '@/util/config';
import Overlay from '@/overlay';

type ContentMessage =
  | { type: 'ping' }
  | { type: typeof type.click; config: StoredConfig };

function installContentScript() {
  if (globalThis[CONTENT_SCRIPT_MARKER]) {
    return;
  }
  globalThis[CONTENT_SCRIPT_MARKER] = true;

  browser.runtime.onMessage.addListener((raw: unknown) => {
    const message = raw as ContentMessage;
    switch (message.type) {
      case 'ping':
        return Promise.resolve();
      case type.click:
        if (Overlay.isActive) {
          return Overlay.current.close().then(() => ({ overlayActive: false }));
        }
        new Overlay(
          message.config,
          () => browser.runtime.sendMessage({ type: 'close' }),
        );
        return { overlayActive: true };
    }
  });

  window.addEventListener(
    'keydown',
    ({ key }) => {
      if (key === 'Escape' && Overlay.isActive) {
        void Overlay.current.close();
      }
    },
    false,
  );
}

installContentScript();
