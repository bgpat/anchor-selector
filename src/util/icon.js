import browser from 'webextension-polyfill';
import { default as Color } from 'color';
import { variables } from '@/util';

const SVG_SIZE = 16;

export function makeActiveIcon() {
  return fetch(browser.runtime.getURL('icons/anchor-selector.svg'))
    .then((resp) => resp.text())
    .then(async (svg) => {
      const color = Color.hsl(
        await variables.config.get('hue'),
        variables.overlay.selecting.stroke.saturation,
        variables.overlay.selecting.stroke.lightness,
      ).hex();
      const paths = [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
      const canvas = new OffscreenCanvas(SVG_SIZE, SVG_SIZE);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.9;
      paths.forEach((d) => ctx.fill(new Path2D(d)));
      return ctx.getImageData(0, 0, SVG_SIZE, SVG_SIZE);
    });
}
