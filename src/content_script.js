import browser from 'webextension-polyfill';
import { type } from '@/util';
import Overlay from '@/overlay';

browser.runtime.onMessage.addListener(message => {
  switch (message.type) {
    case type.click:
      if (Overlay.isActive) {
        return Overlay.current.close();
      }
      new Overlay(message.config, () =>
        browser.runtime.sendMessage({ type: 'close' }),
      );
      browser.runtime.sendMessage({ type: 'open' });
      break;
  }
});

window.addEventListener(
  'keypress',
  e => {
    if (e.key === 'Escape' && Overlay.isActive) {
      Overlay.current.close();
    }
  },
  false,
);

browser.runtime.sendMessage({ type: 'load' });
