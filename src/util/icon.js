import browser from 'webextension-polyfill';
import { default as Color } from 'color';
import { variables } from '@/util';

const SVG_SIZE = 16;

let anchorPathsPromise = null;

function getAnchorPaths() {
  if (!anchorPathsPromise) {
    anchorPathsPromise = fetch(
      browser.runtime.getURL('icons/anchor-selector.svg'),
    )
      .then((resp) => resp.text())
      .then(
        (svg) => [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]),
      );
  }
  return anchorPathsPromise;
}

function drawLockBadge(ctx) {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(12, 12, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#555';
  ctx.fillRect(10.5, 11.5, 3, 2.5);
  ctx.strokeRect(10.75, 9.25, 2.5, 2.25);
  ctx.restore();
}

function rasterizeAnchor(fillStyle, alpha, withLock) {
  return getAnchorPaths().then((paths) => {
    const canvas = new OffscreenCanvas(SVG_SIZE, SVG_SIZE);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = fillStyle;
    ctx.globalAlpha = alpha;
    paths.forEach((d) => ctx.fill(new Path2D(d)));
    if (withLock) {
      drawLockBadge(ctx);
    }
    return ctx.getImageData(0, 0, SVG_SIZE, SVG_SIZE);
  });
}

export function makeActiveIcon() {
  return variables.config.get('hue').then((hue) =>
    rasterizeAnchor(
      Color.hsl(
        hue,
        variables.overlay.selecting.stroke.saturation,
        variables.overlay.selecting.stroke.lightness,
      ).hex(),
      0.9,
      false,
    ),
  );
}

export function makeLockedIcon() {
  return rasterizeAnchor('#555', 0.7, true);
}
