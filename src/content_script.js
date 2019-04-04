import { type } from '@/util';
import Overlay from '@/overlay';

chrome.runtime.onMessage.addListener(message => {
  switch (message.type) {
    case type.click:
      if (Overlay.isActive) {
        return Overlay.current.close();
      }
      new Overlay(() => chrome.runtime.sendMessage({ type: 'close' }));
      chrome.runtime.sendMessage({ type: 'open' });
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
