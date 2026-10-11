import { variables } from '@/util';
import { G, Path, Animate } from './svg';
import { default as Color } from 'color';

function highlightPaint(hue: number) {
  const stroke = variables.overlay.selecting.stroke;
  const fill = variables.overlay.selecting.fill;
  return {
    stroke: `rgb(${Color.hsl(hue, stroke.saturation, stroke.lightness)
      .rgb()
      .array()
      .join(' ')} / ${stroke.alpha})`,
    fill: `rgb(${Color.hsl(hue, fill.saturation, fill.lightness)
      .rgb()
      .array()
      .join(' ')} / ${fill.alpha})`,
  };
}

export default class Selecting extends G {
  static class = 'selecting';

  declare path: Path;

  constructor(config: { hue: number }) {
    const path: Path = new Path({
      children: new Animate(
        {
          attributeName: 'd',
          dur: variables.overlay.selecting.duration,
          repeatCount: 1,
          ...variables.animation.ease,
        },
        () => Number(path.style.opacity) > 0,
      ),
      style: {
        opacity: 0,
        ...highlightPaint(config.hue),
      },
    });
    super({ children: path });
    path.on('transitionend', (event) => {
      const e = event as TransitionEvent;
      if (e.propertyName === 'opacity' && path.style.opacity === '0') {
        path.element.removeAttribute('d');
      }
    });
    this.path = path;
  }

  setHue(hue: number) {
    this.path.style = highlightPaint(hue);
  }

  render(topElement: globalThis.Element | null | undefined) {
    this.path.style = { opacity: +!!topElement };
    if (topElement == null) {
      return;
    }
    const { left, top, right, bottom, width, height } =
      topElement.getBoundingClientRect();
    let pad = 0;
    const swh = variables.overlay.strokeWidth * 0.5;
    if (width <= swh || height <= swh) {
      pad = swh;
    }
    this.path.d = [
      [
        { x: left - pad, y: top - pad },
        { x: right + pad, y: top - pad },
        { x: right - pad, y: bottom + pad },
        { x: left - pad, y: bottom + pad },
      ],
    ];
  }
}
