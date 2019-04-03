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
      .filter(bcr => left <= bcr.left || bcr.left <= right)
      .filter(bcr => left <= bcr.right || bcr.right <= right)
      .filter(bcr => top <= bcr.top || bcr.top <= bottom)
      .filter(bcr => top <= bcr.bottom || bcr.bottom <= bottom)
      .map(bcr => [
        { x: bcr.left, y: bcr.top },
        { x: bcr.right, y: bcr.top },
        { x: bcr.right, y: bcr.bottom },
        { x: bcr.left, y: bcr.bottom },
      ]);
  }
}
