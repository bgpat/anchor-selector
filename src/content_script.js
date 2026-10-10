import browser from 'webextension-polyfill';
import { type } from '@/util';
import Overlay from '@/overlay';

browser.runtime.onMessage.addListener((message) => {
  switch (message.type) {
    case 'ping':
      return;
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
  'keydown',
  ({ key }) => {
    if (key === 'Escape' && Overlay.isActive) {
      Overlay.current.close();
    }
  },
  false,
);
