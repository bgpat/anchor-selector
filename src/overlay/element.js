export default class Element {
  static tag = 'div';

  constructor(opt) {
    let p = { ...opt };
    const gpo = Object.getPrototypeOf;
    for (let i = gpo(this).constructor; i != null; i = gpo(i)) {
      p = {
        ...i,
        ...p,
      };
      if (i === Element || i === Object) {
        break;
      }
    }
    let e;
    if (p.ns == null) {
      e = document.createElement(p.tag);
    } else {
      e = document.createElementNS(p.ns, p.tag);
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

  appendTo(parent) {
    parent.appendChild(this.element);
  }

  append(child) {
    let elem;
    if (child instanceof Element) {
      elem = child;
    }
    if (elem == null) {
      elem = new Wrapper(document.createTextNode(child.toString()));
    }
    this.element.appendChild(elem.element);
    elem.parent = this;
    this.children.push(elem);
  }

  remove() {
    if (this.parent != null) {
      this.parent.children.splice(this.parent.children.indexOf(this), 1);
    }
    this.element.parentNode.removeChild(this.element);
  }

  on(...args) {
    this.element.addEventListener(...args);
  }

  get attrs() {
    return Array.from(this.element.attributes)
      .map((a) => ({
        k: a.name,
        v: a.value,
      }))
      .reduce(
        (o, { k, v }) => ({
          ...o,
          [k]: v,
        }),
        {},
      );
  }

  set attrs(v) {
    Object.entries(v).forEach(([k, v]) => {
      this.element.setAttribute(k, v);
    });
  }

  get class() {
    return this.element.getAttribute('class');
  }

  set class(v) {
    if (Array.isArray(v)) {
      this.element.setAttribute('class', v.join(' '));
      return;
    }
    if (typeof v === 'string') {
      this.element.setAttribute('class', v);
    }
  }

  get style() {
    return this.element.style;
  }

  set style(v) {
    Object.entries(v).forEach(([k, v]) => {
      this.element.style[k] = v;
    });
  }

  get props() {
    return this.element;
  }

  set props(v) {
    Object.entries(v).forEach(([k, v]) => {
      this.element[k] = v;
    });
  }
}

export class Wrapper extends Element {
  constructor(e) {
    super();
    this.element = e;
  }
}
