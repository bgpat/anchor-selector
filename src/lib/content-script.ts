import { browser } from 'wxt/browser';
import { runtimeMessageType, CONTENT_SCRIPT_MARKER, variables } from '@/util';
import type { StoredConfig } from '@/util/config';
import Overlay, { waitForDocumentBody } from '@/overlay';

type ContentMessage =
  | { type: typeof runtimeMessageType.getState }
  | {
      type: typeof runtimeMessageType.setSelection;
      active: boolean;
      config: StoredConfig;
    };

export type ContentScriptInstall = 'installed' | 'already';

let openingOverlay = false;

export function notifyContentScriptReady(injected: boolean) {
  void browser.runtime
    .sendMessage({
      type: runtimeMessageType.contentScriptReady,
      injected,
    })
    .catch(() => {});
}

function endSelection() {
  void browser.runtime
    .sendMessage({ type: runtimeMessageType.selectionEnded })
    .catch(() => {});
}

function registerContentScriptListeners() {
  browser.runtime.onMessage.addListener((raw: unknown) => {
    const message = raw as ContentMessage;
    switch (message.type) {
      case runtimeMessageType.getState:
        return Promise.resolve({
          overlayActive: Overlay.current != null,
        });
      case runtimeMessageType.setSelection:
        if (message.active) {
          return openOverlay(message.config);
        }
        return closeOverlay();
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

  window.addEventListener('pagehide', () => {
    void Overlay.current?.close();
  });

  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) {
      return;
    }
    const overlay = Overlay.current;
    if (overlay) {
      void overlay.close();
    }
    notifyContentScriptReady(false);
  });
}

/** Drop overlay nodes left behind when the extension was disabled. */
function removeOrphanOverlays() {
  document
    .querySelectorAll(`.${variables.overlay.class}`)
    .forEach((node) => node.remove());
}

/** Idempotent: listener registration runs once per document. */
export function ensureContentScriptInstalled(): ContentScriptInstall {
  if (globalThis[CONTENT_SCRIPT_MARKER]) {
    return 'already';
  }
  removeOrphanOverlays();
  globalThis[CONTENT_SCRIPT_MARKER] = true;
  registerContentScriptListeners();
  return 'installed';
}

async function closeOverlay() {
  const overlay = Overlay.current;
  if (overlay) {
    await overlay.close();
  }
  return { overlayActive: false as const };
}

async function openOverlay(config: StoredConfig) {
  if (Overlay.current) {
    return { overlayActive: true as const };
  }
  if (openingOverlay) {
    await waitForDocumentBody();
    return { overlayActive: Overlay.current != null };
  }
  openingOverlay = true;
  try {
    await waitForDocumentBody();
    if (Overlay.current) {
      return { overlayActive: true as const };
    }
    removeOrphanOverlays();
    new Overlay(config, endSelection);
    return { overlayActive: true as const };
  } finally {
    openingOverlay = false;
  }
}
