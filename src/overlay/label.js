import { variables } from '@/util';
import { G, Text } from './svg';

export default class Label extends G {
  static class = 'label';

  render(curr, { left, right, top, bottom }) {
    if (curr !== this.prev) {
      this.children
        .filter((e) => e.target === this.prev)
        .forEach((e) => {
          e.style = { opacity: 0 };
        });
      this.prev = curr;
      curr == null || this.append(new LabelContent(curr));
    }
    if (curr == null) {
      return;
    }
    const bcr = curr.getBoundingClientRect();
    this.children
      .filter((e) => e.target === curr)
      .forEach((e) => {
        let x = (Math.max(left, bcr.left) + Math.min(right, bcr.right)) * 0.5;
        let y = (Math.max(top, bcr.top) + Math.min(bottom, bcr.bottom)) * 0.5;
        const t = e.element.getBoundingClientRect();
        const margin = variables.overlay.label.margin;
        let textAnchor = 'middle';
        let dominantBaseline = 'central';
        if (bcr.width - t.width < margin || bcr.height - t.height < margin) {
          if (x - t.width * 0.5 < left + margin * 0.5) {
            x = bcr.left;
            textAnchor = 'left';
          } else if (x + t.width * 0.5 > right - margin * 0.5) {
            x = bcr.right - t.width;
            textAnchor = 'right';
          }
          if (bcr.height < (t.height + margin) * 3) {
            if (bcr.top - t.height < top + margin * 0.5) {
              y = Math.min(bottom - t.height, bcr.bottom) + margin * 0.5;
              dominantBaseline = 'text-before-edge';
            } else {
              y = bcr.top - margin * 0.5;
              dominantBaseline = 'text-after-edge';
            }
          }
        }
        e.children.forEach((t) => {
          t.attrs = { x, y };
          t.style = { textAnchor, dominantBaseline };
        });
      });
  }
}

class LabelContent extends G {
  static class = 'label-content';

  constructor(target) {
    super({
      children: [
        new Text({ class: 'text-bg' }),
        new Text({ class: 'text-fg' }),
      ],
    });
    this.children.forEach((c) => (c.value = `#${target.id || target.name}`));
    this.target = target;
    this.on('transitionend', (e) => {
      if (e.propertyName === 'opacity' && this.style.opacity === '0') {
        this.remove();
      }
    });
  }
}
