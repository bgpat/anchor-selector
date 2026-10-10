import { installContentScript } from '@/lib/content-script';
import variables from '@/util/variables';
import Overlay from '@/overlay';

export default defineContentScript({
  matches: ['http://127.0.0.1/*'],
  registration: 'manifest',
  main() {
    installContentScript();

    window.addEventListener('anchor-selector-e2e', () => {
      void (async () => {
        const config = await variables.config.getAll();
        if (Overlay.isActive) {
          await Overlay.current.close();
          return;
        }
        new Overlay(config, () =>
          browser.runtime.sendMessage({ type: 'close' }),
        );
      })();
    });
  },
});
