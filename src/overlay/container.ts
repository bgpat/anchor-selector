import { isExtensionContextValid, variables } from '@/util';
import { topID, topElement } from '@/anchor-selector';
import Element from './element';
import { SVG } from './svg';
import Background from './background';
import Selecting from './selecting';
import Label from './label';

type OverlayControl = {
  readonly selecting: boolean;
  select(id: string | null | undefined, event: MouseEvent): Promise<void>;
  close(): Promise<unknown>;
};

type Paintable = Element & {
  render?: (
    target: globalThis.Element | null | undefined,
    bounds: DOMRect,
  ) => void;
};

type WindowListener = {
  name: string;
  listener: EventListener;
  capture: boolean;
};

export default class Container extends Element {
  static class = variables.overlay.class;

  declare overlay: OverlayControl;
  declare svg: SVG;
  declare mouse?: { x: number; y: number } | null;
  declare listeners: WindowListener[];

  constructor(overlay: OverlayControl, config: { hue: number }) {
    const svg = new SVG({
      children: [new Background(), new Selecting(config), new Label()],
    });
    super({ children: svg });
    this.listeners = [];
    this.listen(
      'mousemove',
      (event) => {
        if (this.releaseIfContextDead()) {
          return;
        }
        const { clientX, clientY } = event as MouseEvent;
        this.move(clientX, clientY);
      },
      true,
    );
    this.listen(
      'mouseleave',
      () => {
        if (this.releaseIfContextDead()) {
          return;
        }
        this.move();
      },
      true,
    );
    this.listen(
      'click',
      (event) => {
        if (this.releaseIfContextDead() || !overlay.selecting) {
          return;
        }
        const mouse = event as MouseEvent;
        void overlay.select(topID(mouse.clientX, mouse.clientY), mouse);
      },
      true,
    );
    for (const name of [
      'mousedown',
      'mouseover',
      'mouseup',
      'pointerdown',
      'pointerover',
      'pointerup',
      'click',
    ]) {
      this.listen(
        name,
        (event) => {
          if (this.releaseIfContextDead() || !overlay.selecting) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
        },
        true,
      );
    }
    this.overlay = overlay;
    this.svg = svg;
    window.requestAnimationFrame(() => this.render());
  }

  disconnect() {
    for (const { name, listener, capture } of this.listeners) {
      window.removeEventListener(name, listener, capture);
    }
    this.listeners = [];
  }

  private listen(name: string, listener: EventListener, capture: boolean) {
    window.addEventListener(name, listener, capture);
    this.listeners.push({ name, listener, capture });
  }

  private releaseIfContextDead() {
    if (isExtensionContextValid()) {
      return false;
    }
    void this.overlay.close();
    return true;
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
    if (!this.overlay.selecting || this.releaseIfContextDead()) {
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
