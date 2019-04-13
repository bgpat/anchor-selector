import { createCanvas, loadImage } from 'canvas';
import { default as Color } from 'color';
import { variables } from '@/util';

export function makeActiveIcon() {
  return fetch(chrome.runtime.getURL('../../icons/anchor-selector.svg'))
    .then(resp => resp.text())
    .then(svg =>
      svg.replace(
        '"context-fill"',
        `"${Color.hsl(
          variables.overlay.selecting.stroke.hue,
          variables.overlay.selecting.stroke.saturation,
          variables.overlay.selecting.stroke.lightness,
        ).hex()}"`,
      ),
    )
    .then(svg => svg.replace('"context-fill-opacity"', '"0.9"'))
    .then(svg => new Blob([svg], { type: 'image/svg+xml' }))
    .then(blob => loadImage(URL.createObjectURL(blob)))
    .then(img => {
      const canvas = createCanvas(img.width, img.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, img.width, img.height);
      return ctx.getImageData(0, 0, img.width, img.height);
    });
}
