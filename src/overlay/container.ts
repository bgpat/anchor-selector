import { variables } from '@/util';
import { topID, topElement } from '@/anchor-selector';
import Element from './element';
import { SVG } from './svg';
import Background from './background';
import Selecting from './selecting';
import Label from './label';

type OverlayControl = {
  readonly selecting: boolean;
  select(id: string | null | undefined, event: MouseEvent): Promise<void>;
};

type Paintable = Element & {
  render?: (
    target: globalThis.Element | null | undefined,
    bounds: DOMRect,
  ) => void;
};

export default class Container extends Element {
  static class = variables.overlay.class;

  declare overlay: OverlayControl;
  declare svg: SVG;
  declare mouse?: { x: number; y: number } | null;

  constructor(overlay: OverlayControl, config: { hue: number }) {
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

  setHue(hue: number) {
    for (const child of this.svg.children) {
      if (child instanceof Selecting) {
        child.setHue(hue);
        return;
      }
    }
  }

  render() {
    if (!this.overlay.selecting) {
      return;
    }
    const bcr = this.element.getBoundingClientRect();
    const te = this.mouse && topElement(this.mouse.x, this.mouse.y);
    this.svg.size(bcr.width, bcr.height);
    this.svg.children.forEach((child) => {
      const e = child as Paintable;
      e.render && e.render(te, bcr);
    });
    window.requestAnimationFrame(() => this.render());
  }

  move(x?: number, y?: number) {
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
