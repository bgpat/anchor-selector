const overlaySelector = '#--anchor-selector-overlay';

browser.runtime.onMessage.addListener(() => {
  let overlay = document.querySelector(overlaySelector);
  if (overlay != null) {
    document.body.removeChild(overlay);
    browser.runtime.sendMessage({
      type: 'close',
    });
    return;
  }
  overlay = document.createElement('div');
  overlay.style = Object.entries({
  }).map(([k, v]) => {
    return `${k.replace(/[A-Z]/g, c => `-${c.toString().toLowerCase()}`)}:${v}`;
  }).join(';');
  overlay.id = overlaySelector.slice(1);
  overlay.addEventListener('click', e => {
    const x = e.clientX;
    const y = e.clientY;
    Array.from(document.elementsFromPoint(x, y)).some((e) => {
      if (e === overlay || e.id === '') {
        return;
      }
      history.pushState(null, null, `#${e.id}`);
      return true;
    }) || history.pushState(null, null, location.href.replace(/#.*$/, ''));
    document.body.removeChild(overlay);
    browser.runtime.sendMessage({
      action: 'close',
    });
  }, true);
  overlay.addEventListener('mousemove', e => {
    overlay.dataset.x = e.clientX;
    overlay.dataset.y = e.clientY;
  }, false);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const shadow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const active = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const activeAnim = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
  const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  shadow.className.baseVal = 'shadow';
  active.className.baseVal = 'active';
  label.className.baseVal = 'label';
  activeAnim.setAttribute('attributeName', 'd');
  activeAnim.setAttribute('dur', '0.15s');
  activeAnim.setAttribute('repeatCount', '1');
  activeAnim.setAttribute('keySplines', '0.42 0 0.58 1');
  activeAnim.setAttribute('calcMode', 'spline');
  overlay.appendChild(svg);
  svg.appendChild(shadow);
  svg.appendChild(active);
  svg.appendChild(label);
  active.appendChild(activeAnim);
  document.body.appendChild(overlay);
  drawSelection(svg);
});

window.addEventListener('keypress', e => {
  if (e.key === 'Escape') {
    const overlay = document.querySelector(overlaySelector);
    if (overlay) {
      document.body.removeChild(overlay);
      browser.runtime.sendMessage({
        type: 'close',
      });
    }
  }
}, false);

function drawSelection(svg) {
  const overlay = document.querySelector(overlaySelector);
  if (overlay == null) {
    return;
  }
  const shadow = svg.querySelector('.shadow');
  const active = svg.querySelector('.active');
  const activeAnim = active.querySelector('animate');
  const label = svg.querySelector('.label');
  const or = overlay.getBoundingClientRect();
  const d = overlay.dataset;
  let fg = null;
  if (d.x != null && d.y != null) {
    fg = document.elementsFromPoint(d.x, d.y).find((e) => {
      return e.id !== '' && e.id !== overlaySelector.slice(1);
    });
  }
  let pathSegList = [];
  Array.from(document.querySelectorAll(`[id]:not(${overlaySelector})`))
    .map(e => ({
      e,
      r: e.getBoundingClientRect(),
    }))
    .filter(e => or.left <= e.r.left || e.r.left <= or.bottom)
    .filter(e => or.left <= e.r.right || e.r.right <= or.bottom)
    .filter(e => or.top <= e.r.top || e.r.top <= or.bottom)
    .filter(e => or.top <= e.r.bottom || e.r.bottom <= or.bottom)
    .forEach((c) => {
      const d = [
        `M${c.r.left},${c.r.top}`,
        `L${c.r.right},${c.r.top}`,
        `L${c.r.right},${c.r.bottom}`,
        `L${c.r.left},${c.r.bottom}`,
        'Z',
      ];
      if (c.e === fg) {
        const prev = active.getAttribute('d');
        const next = d.join(' ');
        if (!prev || prev !== next) {
          if (active.style.opacity > 0) {
            activeAnim.setAttribute('from', prev);
            activeAnim.setAttribute('to', next);
            activeAnim.beginElement();
          }
          active.setAttribute('d', next);

          label.textContent = `#${c.e.id}`;
          const left = Math.max(c.r.left, or.left);
          const top = Math.max(c.r.top, or.top);
          const right = Math.min(c.r.right, or.right);
          const bottom = Math.min(c.r.bottom, or.bottom);
          const x = (left + right) * 0.5;
          const y = (top + bottom) * 0.5;
          label.setAttribute('x', x);
          label.setAttribute('y', y);
        }
      }
      pathSegList.push(...d);
    });
  svg.setAttribute('width', or.width);
  svg.setAttribute('height', or.height);
  shadow.setAttribute('d', pathSegList.join(' '));
  active.style.opacity = fg == null ? 0 : 1;
  label.style.opacity = fg == null ? 0 : 1;
  window.requestAnimationFrame(() => drawSelection(svg));
}
