function elements(x, y) {
  return Array.from(document.elementsFromPoint(x, y));
}

export function topElement(x, y) {
  let elem;
  elements(x, y).some((e) => {
    if (e.id !== '') {
      elem = e;
      return true;
    }
    if (e.tagName === 'A' && e.name !== '') {
      elem = e;
      return true;
    }
  });
  return elem;
}

export function topID(x, y) {
  const e = topElement(x, y);
  return e && (e.id || e.name);
}
