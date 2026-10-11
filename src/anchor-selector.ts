import { variables } from '@/util';

function elements(x: number, y: number) {
  return Array.from(document.elementsFromPoint(x, y));
}

function invisibleElements(x: number, y: number) {
  return Array.from(document.querySelectorAll('a[name], [id]'))
    .filter((e) => e.checkVisibility())
    .map((element) => ({
      element,
      bounding: element.getBoundingClientRect(),
    }))
    .filter(({ bounding: { width, height } }) => width <= 0 || height <= 0)
    .map((i) => ({
      ...i,
      distance:
        Math.min((i.bounding.left - x) ** 2, (i.bounding.right - x) ** 2) +
        Math.min((i.bounding.top - y) ** 2, (i.bounding.bottom - y) ** 2),
    }))
    .filter(({ distance }) => distance < variables.minimumDistance ** 2)
    .sort((a, b) => a.distance - b.distance)
    .map((i) => i.element);
}

export function topElement(x: number, y: number) {
  return [...invisibleElements(x, y), ...elements(x, y)].find((e) => {
    if (e.id !== '') {
      return true;
    }
    return e.tagName === 'A' && (e as HTMLAnchorElement).name !== '';
  });
}

export function topID(x: number, y: number) {
  const e = topElement(x, y);
  if (e == null) {
    return;
  }
  return e.id || (e as HTMLAnchorElement).name;
}
