import Element from './element';

export class SVGElement extends Element {
  static ns = 'http://www.w3.org/2000/svg';

  get attrs() {
    return super.attrs;
  }

  set attrs(v) {
    if (this.animate != null) {
      let from = this.element.getAttribute(this.animate.target);
      let to = v[this.animate.target];
      if (from != null && from !== to) {
        this.animate.attrs = { from, to };
        this.animate.begin();
      }
    }
    super.attrs = v;
  }
}

export class SVG extends SVGElement {
  static tag = 'svg';

  size(width, height) {
    this.attrs = { width, height };
  }
}

export class G extends SVGElement {
  static tag = 'g';
}

export class Path extends SVGElement {
  static tag = 'path';

  get d() {
    return this.element.getAttribute('d');
  }

  set d(v) {
    if (Array.isArray(v)) {
      v = v
        .map((p) =>
          [
            ...p.map((p, i) => {
              return `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`;
            }),
            'Z',
          ].join(' '),
        )
        .join(' ');
    }
    this.attrs = { d: v };
  }
}

export class Animate extends SVGElement {
  static tag = 'animate';

  constructor(attrs, enabled = () => true) {
    super({ attrs });
    this.enabled = enabled;
  }

  get parent() {
    return this._parent;
  }

  set parent(v) {
    this._parent = v;
    v.animate = this;
  }

  get target() {
    return this.element.getAttribute('attributeName');
  }

  begin() {
    this.enabled() && this.element.beginElement();
  }
}

export class Text extends SVGElement {
  static tag = 'text';

  get value() {
    return this.element.textContent;
  }

  set value(v) {
    this.element.textContent = v;
  }
}
