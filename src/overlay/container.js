import { variables } from '@/util';
import { topID, topElement } from '@/anchor-selector';
import Element from './element';
import { SVG } from './svg';
import Background from './background';
import Selecting from './selecting';
import Label from './label';

export default class Container extends Element {
  static class = variables.overlay.class;

  constructor(overlay) {
    const svg = new SVG({
      children: [
        new Background(),
        new Selecting(),
        new Label(),
      ],
    });
    super({ children: svg });
    this.on('mousemove', e => this.move(e.clientX, e.clientY));
    this.on('mouseleave', () => this.move());
    svg.on('click', e => overlay.select(topID(e.clientX, e.clientY)));
    this.overlay = overlay;
    this.svg = svg;
    window.requestAnimationFrame(() => this.render());
  }

  render() {
    if (!this.overlay.selecting) {
      return;
    }
    const bcr = this.element.getBoundingClientRect();
    const te = this.mouse && topElement(this.mouse.x, this.mouse.y);
    this.svg.size(bcr.width, bcr.height);
    this.svg.children.forEach(e => e.render && e.render(te, bcr));
    window.requestAnimationFrame(() => this.render());
  }

  move(x, y) {
    if (x == null || y == null) {
      this.mouse = null;
      return;
    }
    this.mouse = { x, y };
  }
}
