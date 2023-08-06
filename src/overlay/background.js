import { variables } from '@/util';
import { G, Path } from './svg';

export default class Background extends G {
  static class = 'background';

  constructor() {
    const path = new Path();
    super({ children: path });
    this.path = path;
  }

  render(topElement, { left, top, right, bottom }) {
    this.path.d = Array.from(document.querySelectorAll('[id], a[name]'))
      .filter((e) => e.checkVisibility())
      .map((e) => e.getBoundingClientRect())
      .filter(
        (bcr) =>
          (left <= bcr.left && bcr.left <= right) ||
          (left <= bcr.right && bcr.right <= right),
      )
      .filter(
        (bcr) =>
          (top <= bcr.top && bcr.top <= bottom) ||
          (top <= bcr.bottom && bcr.bottom <= bottom),
      )
      .map(({left, top, right, bottom, width, height}) => {
        let pad = 0;
        const swh = variables.overlay.strokeWidth * 0.5;
        if (width <= swh || height <= swh) {
          pad = swh;
        }
        return [
          { x: left - pad, y: top - pad },
          { x: right + pad, y: top - pad },
          { x: right + pad, y: bottom + pad },
          { x: left - pad, y: bottom + pad },
        ];
      });
  }
}
