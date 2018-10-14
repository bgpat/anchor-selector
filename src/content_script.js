import { type } from '@/util';
import Overlay from '@/overlay';

browser.runtime.onMessage.addListener((message) => {
  switch (message.type) {
    case type.click:
      if (Overlay.isActive) {
        return Overlay.current.abort();
      }
      new Overlay();
      break;
  }
});

window.addEventListener('keypress', e => {
  if (e.key === 'Escape' && Overlay.isActive) {
    Overlay.current.abort();
  }
}, false);
