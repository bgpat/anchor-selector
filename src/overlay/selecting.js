import { variables } from '@/util';
import { G, Path, Animate } from './svg';

export default class Selecting extends G {
  static class = 'selecting';

  constructor() {
    const path = new Path({
      children: new Animate({
        attributeName: 'd',
        dur: variables.overlay.selecting.duration,
        repeatCount: 1,
        ...variables.animation.ease,
      }, () => path.style.opacity > 0),
      style: {
        opacity: 0,
      }
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
    this.path.d = [[
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom },
    ]];
  }
}

