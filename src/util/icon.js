import browser from 'webextension-polyfill';
import { createCanvas, loadImage } from 'canvas';
import { default as Color } from 'color';
import { variables } from '@/util';

export function makeActiveIcon() {
  return fetch(browser.runtime.getURL('../../icons/anchor-selector.svg'))
    .then((resp) => resp.text())
    .then(async (svg) => {
      return svg.replace(
        '"context-fill #555"',
        `"${Color.hsl(
          await variables.config.get('hue'),
          variables.overlay.selecting.stroke.saturation,
          variables.overlay.selecting.stroke.lightness,
        ).hex()}"`,
      );
    })
    .then((svg) => svg.replace('"context-fill-opacity 0.7"', '"0.9"'))
    .then((svg) => new Blob([svg], { type: 'image/svg+xml' }))
    .then((blob) => loadImage(URL.createObjectURL(blob)))
    .then((img) => {
      const canvas = createCanvas(img.width, img.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, img.width, img.height);
      return ctx.getImageData(0, 0, img.width, img.height);
    });
}
