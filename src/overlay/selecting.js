import { variables } from '@/util';
import { G, Path, Animate } from './svg';
import { default as Color } from 'color';

export default class Selecting extends G {
  static class = 'selecting';

  constructor(config) {
    const path = new Path({
      children: new Animate(
        {
          attributeName: 'd',
          dur: variables.overlay.selecting.duration,
          repeatCount: 1,
          ...variables.animation.ease,
        },
        () => path.style.opacity > 0,
      ),
      style: {
        opacity: 0,
        stroke: `rgba(${[
          ...Color.hsl(
            config.hue,
            variables.overlay.selecting.stroke.saturation,
            variables.overlay.selecting.stroke.lightness,
          )
            .rgb()
            .array(),
          variables.overlay.selecting.stroke.alpha,
        ].join(',')})`,
        fill: `rgba(${[
          ...Color.hsl(
            config.hue,
            variables.overlay.selecting.fill.saturation,
            variables.overlay.selecting.fill.lightness,
          )
            .rgb()
            .array(),
          variables.overlay.selecting.fill.alpha,
        ].join(',')})`,
      },
    });
    super({ children: path });
    path.on('transitionend', e => {
      if (e.propertyName === 'opacity' && path.style.opacity === '0') {
        path.element.removeAttribute('d');
      }
    });
    this.path = path;
  }

  render(topElement) {
    this.path.style = { opacity: +!!topElement };
    if (topElement == null) {
      return;
    }
    const { left, top, right, bottom } = topElement.getBoundingClientRect();
    this.path.d = [
      [
        { x: left, y: top },
        { x: right, y: top },
        { x: right, y: bottom },
        { x: left, y: bottom },
      ],
    ];
  }
}
