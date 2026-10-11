import { variables } from '@/util';
import { G, Path, Animate } from './svg';
import { default as Color } from 'color';

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
        stroke: `rgb(${Color.hsl(
          config.hue,
          variables.overlay.selecting.stroke.saturation,
          variables.overlay.selecting.stroke.lightness,
        )
          .rgb()
          .array()
          .join(' ')} / ${variables.overlay.selecting.stroke.alpha})`,
        fill: `rgb(${Color.hsl(
          config.hue,
          variables.overlay.selecting.fill.saturation,
          variables.overlay.selecting.fill.lightness,
        )
          .rgb()
          .array()
          .join(' ')} / ${variables.overlay.selecting.fill.alpha})`,
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
