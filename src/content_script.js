import browser from 'webextension-polyfill';
import { type, CONTENT_SCRIPT_MARKER } from '@/util';
import Overlay from '@/overlay';

function installContentScript() {
  if (globalThis[CONTENT_SCRIPT_MARKER]) {
    return;
  }
  globalThis[CONTENT_SCRIPT_MARKER] = true;

  browser.runtime.onMessage.addListener((message) => {
    switch (message.type) {
      case 'ping':
        return Promise.resolve();
      case type.click:
        if (Overlay.isActive) {
          Overlay.current.close();
          return { overlayActive: false };
        }
        new Overlay(message.config, () =>
          browser.runtime.sendMessage({ type: 'close' }),
        );
        return { overlayActive: true };
    }
  });

  window.addEventListener(
    'keydown',
    ({ key }) => {
      if (key === 'Escape' && Overlay.isActive) {
        Overlay.current.close();
      }
    },
    false,
  );
}

installContentScript();
