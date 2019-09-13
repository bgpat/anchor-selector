import { G, Path } from './svg';

export default class Background extends G {
  static class = 'background';

  constructor() {
    const path = new Path();
    super({ children: path });
    this.path = path;
  }

  render(topElement, { left, top, right, bottom }) {
    this.path.d = Array.from(document.querySelectorAll('[id]'))
      .map(e => e.getBoundingClientRect())
      .filter(
        bcr =>
          (left <= bcr.left && bcr.left <= right) ||
          (left <= bcr.right && bcr.right <= right),
      )
      .filter(
        bcr =>
          (top <= bcr.top && bcr.top <= bottom) ||
          (top <= bcr.bottom && bcr.bottom <= bottom),
      )
      .filter(bcr => bcr.left !== bcr.right)
      .filter(bcr => bcr.top !== bcr.bottom)
      .map(bcr => [
        { x: bcr.left, y: bcr.top },
        { x: bcr.right, y: bcr.top },
        { x: bcr.right, y: bcr.bottom },
        { x: bcr.left, y: bcr.bottom },
      ]);
  }
}
