import Container from './container';

let current = null;

export default class Overlay {
  static get isActive() {
    return current != null;
  }

  static get current() {
    return current;
  }

  constructor(callback) {
    this.container = new Container(this);
    this.container.appendTo(document.body);
    this.callback = callback;
    current = this;
  }

  get selecting() {
    return this === current;
  }

  select(id) {
    let to = id == null ? location.href.replace(/#.*/, '') : `#${id}`;
    history.pushState(null, null, to);
    this.close();
  }

  close() {
    if (this.selecting) {
      this.container.remove();
      current = null;
    }
    this.callback();
  }
}
