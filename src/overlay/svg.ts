import Element, { type AttrMap } from './element';

export class SVGElement extends Element {
  static ns = 'http://www.w3.org/2000/svg';

  get attrs(): Record<string, string> {
    return super.attrs;
  }

  set attrs(v: AttrMap) {
    const animate = this.animate;
    const target = animate?.target;
    if (animate != null && target != null && target in v) {
      const from = this.element.getAttribute(target);
      const to = String(v[target]);
      if (from != null && from !== to) {
        animate.attrs = { from, to, fill: 'freeze' };
        const { [target]: _, ...rest } = v;
        super.attrs = rest;
        if (!animate.begin()) {
          this.element.setAttribute(target, to);
        }
        return;
      }
    }
    super.attrs = v;
  }
}

export class SVG extends SVGElement {
  static tag = 'svg';

  size(width: number, height: number) {
    this.attrs = { width, height };
  }
}

export class G extends SVGElement {
  static tag = 'g';
}

type Point = { x: number; y: number };

export class Path extends SVGElement {
  static tag = 'path';

  get d(): string | null {
    return this.element.getAttribute('d');
  }

  set d(v: string | Point[][] | null) {
    const value = Array.isArray(v)
      ? v
          .map((ring) =>
            [
              ...ring.map((point, i) => {
                return `${i === 0 ? 'M' : 'L'}${point.x},${point.y}`;
              }),
              'Z',
            ].join(' '),
          )
          .join(' ')
      : v;
    this.attrs = { d: value ?? '' };
  }
}

export class Animate extends SVGElement {
  static tag = 'animate';

  declare enabled: () => boolean;
  declare _parent?: Element;

  constructor(attrs: AttrMap, enabled: () => boolean = () => true) {
    super({ attrs });
    this.enabled = enabled;
  }

  get parent(): Element | undefined {
    return this._parent;
  }

  set parent(v: Element | undefined) {
    this._parent = v;
    if (v != null) {
      v.animate = this;
    }
  }

  get target(): string | null {
    return this.element.getAttribute('attributeName');
  }

  begin(): boolean {
    if (!this.enabled()) {
      return false;
    }
    const el = this.element as SVGAnimateElement;
    const target = this.target;
    const parent = this._parent;
    const to = el.getAttribute('to');
    if (target != null && parent != null && to != null) {
      const onEnd = () => {
        el.removeEventListener('endEvent', onEnd);
        parent.element.setAttribute(target, to);
      };
      el.addEventListener('endEvent', onEnd);
    }
    el.beginElement();
    return true;
  }
}

export class Text extends SVGElement {
  static tag = 'text';

  get value(): string | null {
    return this.element.textContent;
  }

  set value(v: string | null) {
    this.element.textContent = v;
  }
}
