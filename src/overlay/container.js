import { variables } from '@/util';
import { topID, topElement } from '@/anchor-selector';
import Element from './element';
import { SVG } from './svg';
import Background from './background';
import Selecting from './selecting';
import Label from './label';

export default class Container extends Element {
  static class = variables.overlay.class;

  constructor(overlay, config) {
    const svg = new SVG({
      children: [new Background(), new Selecting(config), new Label()],
    });
    super({ children: svg });
    window.addEventListener(
      'mousemove',
      ({ clientX, clientY }) => this.move(clientX, clientY),
      true,
    );
    window.addEventListener('mouseleave', () => this.move(), true);
    window.addEventListener(
      'click',
      (e) => overlay.select(topID(e.clientX, e.clientY), e),
      true,
    );
    [
      'mousedown',
      'mouseover',
      'mouseup',
      'pointerdown',
      'pointerover',
      'pointerup',
      'click',
    ].forEach((name) =>
      window.addEventListener(
        name,
        (e) => {
          if (overlay.selecting) {
            e.preventDefault();
            e.stopPropagation();
          }
        },
        true,
      ),
    );
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
    this.svg.children.forEach((e) => e.render && e.render(te, bcr));
    window.requestAnimationFrame(() => this.render());
  }

  move(x, y) {
    if (!this.overlay.selecting) {
      return;
    }
    if (x == null || y == null) {
      this.mouse = null;
      return;
    }
    this.mouse = { x, y };
  }
}
