import { installContentScript } from '@/lib/content-script';
import { runtimeMessageType } from '@/util';
import variables from '@/util/variables';
import Overlay from '@/overlay';

export default defineContentScript({
  matches: ['http://127.0.0.1/*'],
  registration: 'manifest',
  main() {
    installContentScript();

    window.addEventListener('anchor-selector-e2e-hue', (event) => {
      const hue = (event as CustomEvent<number>).detail;
      if (typeof hue !== 'number') {
        return;
      }
      void browser.storage.sync.set({ hue });
    });

    window.addEventListener('anchor-selector-e2e', () => {
      void (async () => {
        const config = await variables.config.getAll();
        const overlay = Overlay.current;
        if (overlay) {
          await overlay.close();
          return;
        }
        new Overlay(config, () =>
          browser.runtime.sendMessage({ type: runtimeMessageType.close }),
        );
      })();
    });

    window.addEventListener('anchor-selector-e2e-options-open', () => {
      void browser.runtime.sendMessage({
        type: runtimeMessageType.openOptionsE2e,
      });
    });
  },
});
