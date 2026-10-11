export type AttrMap = Record<string, string | number>;
export type StyleMap = Record<string, string | number>;

type ElementChild = Element | string | number;

type ElementInit = {
  tag?: string;
  ns?: string | null;
  class?: string | string[];
  children?: ElementChild | ElementChild[];
  attrs?: AttrMap;
  style?: StyleMap;
  props?: Record<string, unknown>;
};

export type ElementAnimate = {
  readonly target: string | null;
  attrs: AttrMap;
  begin(): boolean;
};

export default class Element {
  static tag = 'div';

  declare element: globalThis.Element;
  declare children: Element[];
  declare animate?: ElementAnimate;

  constructor(opt: ElementInit = {}) {
    let p: ElementInit = { ...opt };
    const gpo = Object.getPrototypeOf;
    for (let i: object | null = gpo(this).constructor; i != null; i = gpo(i)) {
      p = {
        ...(i as unknown as ElementInit),
        ...p,
      };
      if (i === Element || i === Object) {
        break;
      }
    }
    const tag = p.tag as string;
    let e: globalThis.Element;
    if (p.ns == null) {
      e = document.createElement(tag);
    } else {
      e = document.createElementNS(p.ns, tag);
    }
    this.element = e;
    let children = p.children || [];
    if (!Array.isArray(children)) {
      children = [children];
    }
    this.children = [];
    children.forEach((c) => this.append(c));
    this.attrs = p.attrs || {};
    this.class = p.class;
    this.style = p.style || {};
    this.props = p.props || {};
  }

  appendTo(parent: Node) {
    parent.appendChild(this.element);
  }

  append(child: ElementChild) {
    let elem: Element | undefined;
    if (child instanceof Element) {
      elem = child;
    }
    if (elem == null) {
      elem = new Wrapper(document.createTextNode(String(child)));
    }
    this.element.appendChild(elem.element);
    (elem as Element & { parent?: Element }).parent = this;
    this.children.push(elem);
  }

  remove() {
    const parent = (this as Element & { parent?: Element }).parent;
    if (parent != null) {
      parent.children.splice(parent.children.indexOf(this), 1);
    }
    this.element.parentNode!.removeChild(this.element);
  }

  on(...args: Parameters<globalThis.Element['addEventListener']>) {
    this.element.addEventListener(...args);
  }

  get attrs(): Record<string, string> {
    return Array.from(this.element.attributes)
      .map((a) => ({
        k: a.name,
        v: a.value,
      }))
      .reduce<Record<string, string>>(
        (o, { k, v }) => ({
          ...o,
          [k]: v,
        }),
        {},
      );
  }

  set attrs(v: AttrMap) {
    Object.entries(v).forEach(([k, value]) => {
      this.element.setAttribute(k, String(value));
    });
  }

  get class(): string | null {
    return this.element.getAttribute('class');
  }

  set class(v: string | string[] | null | undefined) {
    if (Array.isArray(v)) {
      this.element.setAttribute('class', v.join(' '));
      return;
    }
    if (typeof v === 'string') {
      this.element.setAttribute('class', v);
    }
  }

  get style(): CSSStyleDeclaration {
    return (this.element as HTMLElement | SVGElement).style;
  }

  set style(v: StyleMap | CSSStyleDeclaration) {
    if (v instanceof CSSStyleDeclaration) {
      return;
    }
    const style = (this.element as HTMLElement | SVGElement).style;
    Object.entries(v).forEach(([k, value]) => {
      (style as unknown as Record<string, string>)[k] = String(value);
    });
  }

  get props(): globalThis.Element {
    return this.element;
  }

  set props(v: Record<string, unknown> | globalThis.Element) {
    if (v instanceof globalThis.Element) {
      return;
    }
    Object.entries(v).forEach(([k, value]) => {
      (this.element as unknown as Record<string, unknown>)[k] = value;
    });
  }
}

export class Wrapper extends Element {
  constructor(e: Node) {
    super();
    this.element = e as globalThis.Element;
  }
}
