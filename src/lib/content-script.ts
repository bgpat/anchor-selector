import { browser } from 'wxt/browser';
import { runtimeMessageType, CONTENT_SCRIPT_MARKER } from '@/util';
import type { StoredConfig } from '@/util/config';
import Overlay from '@/overlay';

type ContentMessage =
  | { type: typeof runtimeMessageType.ping }
  | { type: typeof runtimeMessageType.click; config: StoredConfig };

export function installContentScript() {
  if (globalThis[CONTENT_SCRIPT_MARKER]) {
    return;
  }
  globalThis[CONTENT_SCRIPT_MARKER] = true;

  browser.runtime.onMessage.addListener((raw: unknown) => {
    const message = raw as ContentMessage;
    switch (message.type) {
      case runtimeMessageType.ping:
        return Promise.resolve();
      case runtimeMessageType.click: {
        const overlay = Overlay.current;
        if (overlay) {
          return overlay.close().then(() => ({ overlayActive: false }));
        }
        new Overlay(message.config, () =>
          browser.runtime.sendMessage({ type: runtimeMessageType.close }),
        );
        return { overlayActive: true };
      }
    }
  });

  window.addEventListener(
    'keydown',
    ({ key }) => {
      const overlay = Overlay.current;
      if (key === 'Escape' && overlay) {
        void overlay.close();
      }
    },
    false,
  );
}
