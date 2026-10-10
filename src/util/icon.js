import browser from 'webextension-polyfill';
import { default as Color } from 'color';
import variables from './variables';

const SVG_SIZE = 16;
/** Notification dot on the default toolbar icon (px in 16×16 space). */
const NOTIFICATION_DOT_RADIUS = 1.75;
const NOTIFICATION_DOT_X = SVG_SIZE - 2.5;
const NOTIFICATION_DOT_Y = 2.5;

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

function rasterizeAnchor(fillStyle, alpha) {
  return getAnchorPaths().then((paths) => {
    const canvas = new OffscreenCanvas(SVG_SIZE, SVG_SIZE);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = fillStyle;
    ctx.globalAlpha = alpha;
    paths.forEach((d) => ctx.fill(new Path2D(d)));
    return ctx.getImageData(0, 0, SVG_SIZE, SVG_SIZE);
  });
}

/** Default toolbar anchor color (matches icons/anchor-selector.svg). */
export function makeDefaultIcon() {
  return rasterizeAnchor('#555555', 0.7);
}

export function getSelectionAccentColor() {
  return variables.config.get('hue').then((hue) =>
    Color.hsl(
      hue,
      variables.overlay.selecting.stroke.saturation,
      variables.overlay.selecting.stroke.lightness,
    ).hex(),
  );
}

export function makeActiveIcon() {
  return getSelectionAccentColor().then((hex) => rasterizeAnchor(hex, 0.9));
}

/** Default anchor with a small accent dot (replaces loud action badges). */
export async function makeIconWithNotificationDot() {
  const base = await makeDefaultIcon();
  const canvas = new OffscreenCanvas(SVG_SIZE, SVG_SIZE);
  const ctx = canvas.getContext('2d');
  ctx.putImageData(base, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = await getSelectionAccentColor();
  ctx.beginPath();
  ctx.arc(
    NOTIFICATION_DOT_X,
    NOTIFICATION_DOT_Y,
    NOTIFICATION_DOT_RADIUS,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  return ctx.getImageData(0, 0, SVG_SIZE, SVG_SIZE);
}
